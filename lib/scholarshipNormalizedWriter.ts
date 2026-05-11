import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRequirementsJson } from "@/lib/scholarshipTransform";
import { normalizeCountry, normalizeDegreeLevel } from "@/lib/scholarshipOptions";
import type { Scholarship } from "@/lib/types";

async function upsertCountry(
  db: SupabaseClient,
  name: string,
  flagUrl: string,
): Promise<string> {
  const canonical = normalizeCountry(name) || "Unknown";
  const { data: existing, error: selectError } = await db
    .from("countries")
    .select("id, flag_url")
    .eq("name", canonical)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) {
    if (flagUrl && flagUrl !== existing.flag_url) {
      await db.from("countries").update({ flag_url: flagUrl }).eq("id", existing.id);
    }
    return existing.id as string;
  }
  const { data, error } = await db
    .from("countries")
    .insert({ name: canonical, flag_url: flagUrl })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function upsertOrganization(
  db: SupabaseClient,
  name: string,
  countryId: string,
  embedding?: number[],
): Promise<string> {
  const trimmed = name.trim();
  const hasEmbedding = Array.isArray(embedding) && embedding.length > 0;

  const { data: existing, error: selectError } = await db
    .from("organizations")
    .select("id, embedding_org_country")
    .eq("name", trimmed)
    .eq("country_id", countryId)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    // Lazy backfill: if the row was inserted before migration 008 ran (or by
    // a path that didn't supply an embedding), patch it in now that we have one.
    if (hasEmbedding && !existing.embedding_org_country) {
      const { error } = await db
        .from("organizations")
        .update({ embedding_org_country: embedding })
        .eq("id", existing.id);
      if (error) {
        console.warn(`[writer] organization embedding update failed for ${existing.id}: ${error.message}`);
      }
    }
    return existing.id as string;
  }

  const insertPayload: Record<string, unknown> = { name: trimmed, country_id: countryId };
  if (hasEmbedding) insertPayload.embedding_org_country = embedding;

  const { data, error } = await db
    .from("organizations")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function upsertField(db: SupabaseClient, name: string, embedding?: number[]): Promise<string> {
  const trimmed = name.trim();
  const hasEmbedding = Array.isArray(embedding) && embedding.length > 0;

  const { data: existing, error: selectError } = await db
    .from("fields")
    .select("id, embedding_field")
    .eq("name", trimmed)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    if (hasEmbedding && !existing.embedding_field) {
      const { error } = await db
        .from("fields")
        .update({ embedding_field: embedding })
        .eq("id", existing.id);
      if (error) {
        console.warn(`[writer] field embedding update failed for ${existing.id}: ${error.message}`);
      }
    }
    return existing.id as string;
  }

  const insertPayload: Record<string, unknown> = { name: trimmed };
  if (hasEmbedding) insertPayload.embedding_field = embedding;

  const { data, error } = await db
    .from("fields")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export type UpsertScholarshipOptions = {
  /**
   * When set, treat this as a known existing row and update it directly
   * (skip dedup entirely). Used by the per-id PUT endpoint.
   */
  targetId?: string;
  /**
   * 1536-dim embedding of `s.description` (text-embedding-3-small). When
   * provided, it is persisted to `description_embedding` AND fed into the
   * co-signal dedup RPC so we can catch reworded duplicates. Omit when we
   * couldn't embed; dedup falls back to link + fuzzy name/org only.
   */
  embedding?: number[];
  /**
   * 1536-dim embedding of "{organization name} in {country name}". Written
   * to organizations.embedding_org_country (migration 008) the first time
   * we see the org; backfilled if it was already there without one.
   */
  orgEmbedding?: number[];
  /**
   * 1536-dim embedding of the field name. Written to fields.embedding_field
   * (migration 008) the first time we see the field; backfilled if it was
   * already there without one.
   */
  fieldEmbedding?: number[];
};

type FindDuplicateRow = {
  id: string;
  match_reason: string;
  score: number;
};

/**
 * Co-signal dedup against the existing DB. Returns the matched scholarship id
 * (and the rule that fired) or null. Precedence is enforced server-side in the
 * find_duplicate_scholarship RPC; see supabase/migrations/006_scholarship_dedup.sql.
 *
 *   exact_name_org → link → fuzzy_name_org → embedding_org
 *
 * Embedding alone NEVER rejects — the embedding leg also requires a fuzzy
 * organization match so two distinct scholarships with similar prose from
 * different orgs cannot collide.
 */
async function findDuplicate(
  db: SupabaseClient,
  s: Scholarship,
  organizationId: string,
  embedding: number[] | undefined,
): Promise<{ id: string; reason: string; score: number } | null> {
  const { data, error } = await db.rpc("find_duplicate_scholarship", {
    p_name: s.name,
    p_org_id: organizationId,
    p_org_name: s.organization,
    p_link: s.link ?? "",
    p_embedding: embedding ?? null,
  });

  if (error) {
    // Fail open: don't block writes if the RPC is unavailable / failing.
    // The (name, organization_id) unique constraint is still a safety net.
    console.warn(`[writer] find_duplicate_scholarship failed: ${error.message}. Falling back to (name, organization_id) match only.`);
    return null;
  }

  const rows = (data ?? []) as FindDuplicateRow[];
  if (rows.length === 0) return null;
  const row = rows[0];
  return { id: row.id, reason: row.match_reason, score: row.score };
}

/**
 * Insert or update a scholarship in the normalized schema.
 *
 * - Upserts country / organization / fields lookup rows by their natural keys.
 * - When `opts.targetId` is set, updates that row directly (admin edit path).
 * - Otherwise calls `find_duplicate_scholarship` with the optional embedding
 *   to detect existing duplicates by link / fuzzy name+org / embedding+org,
 *   updating the matched row when one is found.
 * - Persists `opts.embedding` to `description_embedding` (when provided) for
 *   both the dedup co-signal and the "similar scholarships" feature.
 * - Replaces the scholarship_fields links to match the provided field name.
 *
 * Idempotent against rerunning with the same data — no duplicates.
 *
 * Returns the scholarship UUID.
 */
export async function upsertScholarshipNormalized(
  db: SupabaseClient,
  s: Scholarship,
  opts: UpsertScholarshipOptions | string = {},
): Promise<string> {
  // Back-compat: the original signature accepted `targetId` as the third
  // positional arg. Some callers (e.g. PUT /api/scholarships/[id]) still
  // pass a bare string.
  const options: UpsertScholarshipOptions = typeof opts === "string" ? { targetId: opts } : opts;

  const countryId = await upsertCountry(db, s.country, s.flag);
  const organizationId = await upsertOrganization(db, s.organization, countryId, options.orgEmbedding);

  const requirements = buildRequirementsJson(s);
  const payload: Record<string, unknown> = {
    name: s.name,
    country_id: countryId,
    organization_id: organizationId,
    degree: normalizeDegreeLevel(s.degree),
    funding: s.funding,
    // Normalized funding columns (migration 005). undefined when the
    // scholarship is being written from a source that predates the
    // normalization fields; leave those nulls so existing rows aren't
    // overwritten with garbage.
    funding_kind: s.fundingKind ?? null,
    funding_amount_value: s.fundingAmountValue ?? null,
    funding_amount_currency: s.fundingAmountCurrency ?? null,
    funding_amount_period: s.fundingAmountPeriod ?? null,
    deadline: s.deadline,
    description: s.description,
    requirements,
    link: s.link,
    source_name: s.sourceName ?? null,
    source_url: s.sourceUrl ?? null,
    updated_at: new Date().toISOString(),
  };
  if (options.embedding && options.embedding.length > 0) {
    // pgvector accepts the JSON array form; supabase-js serializes it correctly.
    payload.description_embedding = options.embedding;
  }

  let scholarshipId: string | null = options.targetId ?? null;

  if (scholarshipId) {
    // Direct-edit path: caller knows the row id, dedup is intentionally skipped.
    const { error } = await db
      .from("scholarships")
      .update(payload)
      .eq("id", scholarshipId);
    if (error) throw error;
  } else {
    // Scrape / import path: run the co-signal dedup RPC first.
    const duplicate = await findDuplicate(db, s, organizationId, options.embedding);

    if (duplicate) {
      // One-line trace per merge so the dedup thresholds can be tuned by
      // eyeballing the scrape output (low scores on fuzzy/embedding merges
      // are the candidates for review).
      console.log(`[writer] merged "${s.name}" -> ${duplicate.id} (${duplicate.reason}, score=${duplicate.score.toFixed(3)})`);
      scholarshipId = duplicate.id;
      const { error } = await db
        .from("scholarships")
        .update(payload)
        .eq("id", scholarshipId);
      if (error) throw error;
    } else {
      const { data, error } = await db
        .from("scholarships")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      scholarshipId = data.id as string;
    }
  }

  // Sync scholarship_fields: replace with the current field set.
  const fieldName = (s.field ?? "").trim();
  const desiredFieldIds: string[] = fieldName && fieldName.toLowerCase() !== "not specified"
    ? [await upsertField(db, fieldName, options.fieldEmbedding)]
    : [];

  await db.from("scholarship_fields").delete().eq("scholarship_id", scholarshipId);
  if (desiredFieldIds.length > 0) {
    const { error } = await db
      .from("scholarship_fields")
      .insert(desiredFieldIds.map((field_id) => ({ scholarship_id: scholarshipId!, field_id })));
    if (error) throw error;
  }

  return scholarshipId;
}
