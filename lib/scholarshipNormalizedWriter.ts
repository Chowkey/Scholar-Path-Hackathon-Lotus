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
): Promise<string> {
  const trimmed = name.trim();
  const { data: existing, error: selectError } = await db
    .from("organizations")
    .select("id")
    .eq("name", trimmed)
    .eq("country_id", countryId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id as string;
  const { data, error } = await db
    .from("organizations")
    .insert({ name: trimmed, country_id: countryId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function upsertField(db: SupabaseClient, name: string): Promise<string> {
  const trimmed = name.trim();
  const { data: existing, error: selectError } = await db
    .from("fields")
    .select("id")
    .eq("name", trimmed)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id as string;
  const { data, error } = await db
    .from("fields")
    .insert({ name: trimmed })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Insert or update a scholarship in the normalized schema.
 *
 * - Upserts country / organization / fields lookup rows by their natural keys.
 * - Inserts (or updates by id when `targetId` is provided) the scholarship row.
 * - Replaces the scholarship_fields links to match the provided field name.
 *
 * Idempotent against rerunning with the same data — no duplicates.
 *
 * Returns the scholarship UUID.
 */
export async function upsertScholarshipNormalized(
  db: SupabaseClient,
  s: Scholarship,
  targetId?: string,
): Promise<string> {
  const countryId = await upsertCountry(db, s.country, s.flag);
  const organizationId = await upsertOrganization(db, s.organization, countryId);

  const requirements = buildRequirementsJson(s);
  const payload = {
    name: s.name,
    country_id: countryId,
    organization_id: organizationId,
    degree: normalizeDegreeLevel(s.degree),
    funding: s.funding,
    deadline: s.deadline,
    description: s.description,
    requirements,
    link: s.link,
    source_name: s.sourceName ?? null,
    source_url: s.sourceUrl ?? null,
    updated_at: new Date().toISOString(),
  };

  let scholarshipId = targetId ?? null;
  if (scholarshipId) {
    const { error } = await db
      .from("scholarships")
      .update(payload)
      .eq("id", scholarshipId);
    if (error) throw error;
  } else {
    // Try to dedupe by (name, organization_id) — same scholarship from same org.
    const { data: existing } = await db
      .from("scholarships")
      .select("id")
      .eq("name", s.name)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (existing) {
      scholarshipId = existing.id as string;
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
    ? [await upsertField(db, fieldName)]
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
