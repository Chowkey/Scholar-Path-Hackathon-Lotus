/**
 * RAG-style scholarship recommendation pipeline.
 *
 *   Filter (deterministic + embedding gates) → rank by description embedding → top K.
 *
 * Called from /api/chat for the "Recommend scholarships" feature. Designed
 * to gracefully degrade: every filter is conditional on the user having
 * actually expressed a preference. Missing inputs are reported back so the
 * LLM can tell the user "we considered any X because you didn't specify".
 *
 * Inputs:
 *   - userField (e.g. "Applied Computer Science")     → embedding compared to fields.embedding_field
 *   - userOrgText (e.g. "Oxford in United Kingdom")   → embedding compared to organizations.embedding_org_country
 *   - userDegreeTarget ("undergraduate" | "masters" | "phd")
 *   - userCountries (list of country names)
 *   - userFundingPreference ("full" | "partial_or_full" | "unspecified")
 *   - userProfileText (full paragraph summary)        → embedding compared to scholarships.description_embedding for ranking
 *
 * Cost: one embedding call total (3 inputs) per chat turn that triggers
 * recommendation. Scholarship-side embeddings are pre-computed at write time
 * by lib/scholarshipScraper.ts + scripts/backfill*Embeddings.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import type { FundingKind, Scholarship } from "@/lib/types";
import { rowToScholarship } from "@/lib/scholarshipTransform";

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const DEFAULT_FIELD_SIM = 0.7;
const DEFAULT_ORG_SIM = 0.7;
const DEFAULT_LIMIT = 5;

// SELECT string for the recommend query — like SCHOLARSHIP_SELECT but with
// the three embedding columns added. Kept local so it can't accidentally
// leak into other read paths (those embeddings are heavy on the wire).
const RECOMMEND_SELECT = `
  id,
  name,
  degree,
  funding,
  deadline,
  description,
  requirements,
  link,
  source_name,
  source_url,
  created_at,
  updated_at,
  funding_kind,
  description_embedding,
  country:countries ( id, name, flag_url ),
  organization:organizations ( id, name, embedding_org_country ),
  scholarship_fields ( field:fields ( id, name, embedding_field ) )
`;

/**
 * pgvector columns come back from PostgREST as JSON-encoded strings
 * (e.g. "[0.0091, -0.0189, ...]"), NOT as JavaScript arrays. Every embedding
 * field here is typed as the raw wire shape and must be passed through
 * `parseVector()` before use.
 */
type RawVector = number[] | string | null;

type RecommendJoinedRow = {
  id: string;
  name: string;
  degree: string;
  funding: string;
  deadline: string;
  description: string;
  requirements: unknown;
  link: string;
  source_name: string | null;
  source_url: string | null;
  created_at?: string;
  updated_at?: string;
  funding_kind: FundingKind | null;
  description_embedding: RawVector;
  country: { id: string; name: string; flag_url: string } | null;
  organization: { id: string; name: string; embedding_org_country: RawVector } | null;
  scholarship_fields:
    | Array<{ field: { id: string; name: string; embedding_field: RawVector } | null }>
    | null;
};

export type RecommendUserInput = {
  fieldOfStudy?: string | null;
  preferredOrgText?: string | null;     // e.g. "Oxford in United Kingdom" — undefined to skip the org filter.
  degreeTarget?: "undergraduate" | "masters" | "phd" | null;
  targetCountries?: string[];
  fundingPreference?: "full" | "partial_or_full" | "unspecified" | null;
  profileText: string;                  // free-text paragraph for description ranking
};

export type RecommendOptions = {
  limit?: number;
  fieldSimilarityThreshold?: number;
  orgSimilarityThreshold?: number;
};

export type RankedRecommendation = {
  scholarship: Scholarship;
  descriptionSimilarity: number;
  fieldSimilarity: number | null;
  orgSimilarity: number | null;
};

export type MissingPreferenceKey =
  | "fieldOfStudy"
  | "preferredUniversity"
  | "degreeTarget"
  | "targetCountries"
  | "fundingPreference";

export type FieldFilterDebug = {
  /** Rows that had no scholarship_fields link at all. */
  rowsWithoutFields: number;
  /** Rows that had fields, but every field's embedding_field was NULL. */
  rowsWithFieldsButNoEmbedding: number;
  /** Rows where at least one field had an embedding (used for max-sim eval). */
  rowsWithEmbeddedField: number;
  /** Highest field-similarity observed across the whole candidate pool. */
  globalMaxSimilarity: number;
  /** Top 10 (scholarship, bestField, bestSim) for eyeballing — sorted desc. */
  topByBestFieldSimilarity: Array<{ scholarship: string; field: string; similarity: number }>;
};

export type RecommendResult = {
  recommendations: RankedRecommendation[];
  missingPreferences: MissingPreferenceKey[];
  filterStats: {
    totalCandidates: number;
    afterHardFilters: number;
    afterFieldFilter: number;
    afterOrgFilter: number;
    finalCount: number;
    /**
     * Distinct country names present in totalCandidates (post-SQL, pre-country
     * filter). Lets you eyeball whether the user's preferred country exists
     * in the pool at all, vs being lost to a name-spelling mismatch.
     */
    candidateCountries: string[];
    /**
     * Populated only when a field-embedding filter ran (i.e. the user had a
     * fieldOfStudy). Helps diagnose why the gate dropped rows: missing data
     * (no fields / no field embeddings) vs threshold-too-strict.
     */
    fieldFilterDebug?: FieldFilterDebug;
  };
};

// ─── helpers ───────────────────────────────────────────────────────────────

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * pgvector columns are returned by PostgREST as JSON-encoded strings,
 * e.g. "[0.0091, -0.0189, ...]". Convert to a number[] for cosine math.
 * Returns null if the value is missing, empty, or not parseable.
 */
function parseVector(v: RawVector | undefined): number[] | null {
  if (!v) return null;
  if (Array.isArray(v)) return v.length > 0 ? v : null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed.startsWith("[")) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "number") {
        return parsed as number[];
      }
    } catch {
      /* fall through */
    }
  }
  return null;
}

function normalizeCountryName(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Map the user's fundingPreference to the set of funding_kind values that
 * should pass the hard filter. Returns null when no filter should be applied.
 */
function allowedFundingKinds(pref: RecommendUserInput["fundingPreference"]): FundingKind[] | null {
  if (!pref || pref === "unspecified") return null;
  if (pref === "full") return ["full_tuition_plus_stipend", "full_tuition_only"];
  if (pref === "partial_or_full") {
    return ["full_tuition_plus_stipend", "full_tuition_only", "partial", "stipend_only"];
  }
  return null;
}

/**
 * Map the profile's degreeTarget (lowercase, plural — "undergraduate" /
 * "masters" / "phd") to the canonical degree values the scraper writes
 * into scholarships.degree ("Bachelor", "Master", "Doctorate", etc.).
 * Returns null when no degree filter should be applied.
 *
 * Each profile bucket maps to a SET — e.g. a masters seeker should also
 * see MBA and Professional programs.
 */
function allowedDegrees(target: RecommendUserInput["degreeTarget"]): string[] | null {
  if (!target) return null;
  if (target === "undergraduate") {
    return ["Bachelor", "Associate", "Diploma", "Certificate", "Foundation"];
  }
  if (target === "masters") {
    return ["Master", "MBA", "Professional"];
  }
  if (target === "phd") {
    return ["Doctorate", "Postdoctoral"];
  }
  return null;
}

/**
 * Embed the (up to three) user-side texts in a single OpenAI call. Empty
 * inputs are omitted; the returned map has whatever was successfully embedded.
 */
async function embedUserTexts(
  openai: OpenAI,
  texts: { field?: string | null; org?: string | null; profile: string },
): Promise<{ field?: number[]; org?: number[]; profile?: number[] }> {
  const inputs: Array<{ key: "field" | "org" | "profile"; text: string }> = [];
  if (texts.field && texts.field.trim()) inputs.push({ key: "field", text: texts.field.trim() });
  if (texts.org && texts.org.trim()) inputs.push({ key: "org", text: texts.org.trim() });
  if (texts.profile && texts.profile.trim()) inputs.push({ key: "profile", text: texts.profile.trim() });
  if (inputs.length === 0) return {};

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: inputs.map((x) => x.text),
  });
  const data = (response as { data?: Array<{ embedding?: number[] }> }).data ?? [];

  const out: { field?: number[]; org?: number[]; profile?: number[] } = {};
  for (let i = 0; i < inputs.length; i++) {
    const vec = data[i]?.embedding;
    if (Array.isArray(vec) && vec.length > 0) out[inputs[i].key] = vec;
  }
  return out;
}

// ─── main entry point ──────────────────────────────────────────────────────

export async function retrieveScholarshipRecommendations(
  db: SupabaseClient,
  openai: OpenAI,
  input: RecommendUserInput,
  opts: RecommendOptions = {},
): Promise<RecommendResult> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const fieldThreshold = opts.fieldSimilarityThreshold ?? DEFAULT_FIELD_SIM;
  const orgThreshold = opts.orgSimilarityThreshold ?? DEFAULT_ORG_SIM;

  // 1. Track which user preferences are missing — handed back so the LLM can
  // tell the user "I considered any X because you didn't specify one".
  // Country is intentionally NOT a hard filter (see below) — the user's
  // targetCountries reach the LLM via the profile input and become a soft
  // ranking signal there. So it isn't listed here either.
  const missingPreferences: MissingPreferenceKey[] = [];
  if (!input.fieldOfStudy?.trim()) missingPreferences.push("fieldOfStudy");
  if (!input.preferredOrgText?.trim()) missingPreferences.push("preferredUniversity");
  if (!input.degreeTarget) missingPreferences.push("degreeTarget");
  if (!input.fundingPreference || input.fundingPreference === "unspecified") {
    missingPreferences.push("fundingPreference");
  }

  // 2. Embed everything we need from the user side in one API call.
  const userEmbs = await embedUserTexts(openai, {
    field: input.fieldOfStudy ?? null,
    org: input.preferredOrgText ?? null,
    profile: input.profileText,
  });

  // 3. SQL-side hard filters: degree + funding_kind.
  //
  // Degree: the profile uses lowercase plural ("masters") but the scraper
  // stores capitalized singular ("Master"), and a masters-seeker should also
  // see MBA / Professional, so we expand to an .in() set.
  //
  // Funding: lenient on NULL. If the apply-funding-normalization script
  // hasn't run yet, every row has funding_kind=NULL and a strict .in()
  // would exclude all of them. The OR-with-is.null clause keeps unclassified
  // rows in play; the LLM will see the raw `funding` text and decide.
  let query = db.from("scholarships").select(RECOMMEND_SELECT);
  const degreeSet = allowedDegrees(input.degreeTarget);
  if (degreeSet) {
    query = query.in("degree", degreeSet);
  }
  const fundingKinds = allowedFundingKinds(input.fundingPreference);
  if (fundingKinds) {
    const kindList = fundingKinds.map((k) => `"${k}"`).join(",");
    query = query.or(`funding_kind.in.(${kindList}),funding_kind.is.null`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`recommend: scholarship query failed: ${error.message}`);
  const rows = (data ?? []) as unknown as RecommendJoinedRow[];
  const totalCandidates = rows.length;

  // 4. Country is NOT filtered here. Country names in the DB are inconsistent
  // (mixed English / Vietnamese / "Multiple countries in Europe" wildcards)
  // so a strict-name filter was excluding rows the user would actually want.
  // The user's targetCountries are still passed to the LLM in the profile so
  // it can prefer them when ranking — just no hard exclusion.
  const afterCountry = rows;
  const afterHardFilters = afterCountry.length;

  // 5. Field embedding filter — each scholarship has 0+ fields; we keep the
  // row if ANY of its fields hits the threshold. When the user didn't supply
  // a field, skip this step entirely.
  //
  // While filtering we also track best-similarity-per-row and a few aggregate
  // counters so callers can diagnose why the filter dropped rows (no field
  // rows? no embeddings? actual similarities too low?).
  let fieldFilterDebug: FieldFilterDebug | undefined;
  let afterField: RecommendJoinedRow[];

  if (userEmbs.field) {
    afterField = [];
    let rowsWithoutFields = 0;
    let rowsWithFieldsButNoEmbedding = 0;
    let rowsWithEmbeddedField = 0;
    let globalMaxSimilarity = 0;
    const perRow: Array<{ scholarship: string; field: string; similarity: number }> = [];

    for (const r of afterCountry) {
      const fields = r.scholarship_fields ?? [];
      if (fields.length === 0) {
        rowsWithoutFields += 1;
        continue;
      }

      let bestSim = -Infinity;
      let bestFieldName = "";
      let anyEmbedded = false;
      for (const sf of fields) {
        const name = sf.field?.name ?? "(unknown)";
        const fe = parseVector(sf.field?.embedding_field);
        if (fe) {
          anyEmbedded = true;
          const sim = cosine(userEmbs.field, fe);
          if (sim > bestSim) {
            bestSim = sim;
            bestFieldName = name;
          }
        }
      }

      if (!anyEmbedded) {
        rowsWithFieldsButNoEmbedding += 1;
        continue;
      }
      rowsWithEmbeddedField += 1;
      if (bestSim > globalMaxSimilarity) globalMaxSimilarity = bestSim;
      perRow.push({ scholarship: r.name, field: bestFieldName, similarity: bestSim });

      if (bestSim >= fieldThreshold) afterField.push(r);
    }

    perRow.sort((a, b) => b.similarity - a.similarity);
    fieldFilterDebug = {
      rowsWithoutFields,
      rowsWithFieldsButNoEmbedding,
      rowsWithEmbeddedField,
      globalMaxSimilarity,
      topByBestFieldSimilarity: perRow.slice(0, 10),
    };
  } else {
    afterField = afterCountry;
  }
  const afterFieldFilter = afterField.length;

  // 6. Org+country embedding filter. Same gate semantics: skip when the user
  // didn't express a preferred uni.
  const afterOrg = userEmbs.org
    ? afterField.filter((r) => {
        const oe = parseVector(r.organization?.embedding_org_country);
        if (!oe) return false;
        return cosine(userEmbs.org!, oe) >= orgThreshold;
      })
    : afterField;
  const afterOrgFilter = afterOrg.length;

  // 7. Rank survivors by cosine(user_profile, description_embedding). Rows
  // without a description embedding (pre-migration-006 leftovers) sort last
  // at similarity 0.
  const ranked = afterOrg
    .map((r) => {
      const descEmb = parseVector(r.description_embedding);
      const sim = userEmbs.profile && descEmb ? cosine(userEmbs.profile, descEmb) : 0;

      // Carry per-row gate similarities forward for explainability — useful
      // for the LLM when it explains "why this scholarship fits".
      let fieldSim: number | null = null;
      if (userEmbs.field) {
        let best = 0;
        for (const sf of r.scholarship_fields ?? []) {
          const fe = parseVector(sf.field?.embedding_field);
          if (fe) best = Math.max(best, cosine(userEmbs.field, fe));
        }
        fieldSim = best;
      }
      let orgSim: number | null = null;
      if (userEmbs.org) {
        const oe = parseVector(r.organization?.embedding_org_country);
        if (oe) orgSim = cosine(userEmbs.org, oe);
      }

      return {
        scholarship: rowToScholarship(r),
        descriptionSimilarity: sim,
        fieldSimilarity: fieldSim,
        orgSimilarity: orgSim,
      };
    })
    .sort((a, b) => b.descriptionSimilarity - a.descriptionSimilarity)
    .slice(0, limit);

  const candidateCountries = [
    ...new Set(rows.map((r) => r.country?.name).filter((n): n is string => Boolean(n))),
  ].sort();

  return {
    recommendations: ranked,
    missingPreferences,
    filterStats: {
      totalCandidates,
      afterHardFilters,
      afterFieldFilter,
      afterOrgFilter,
      finalCount: ranked.length,
      candidateCountries,
      fieldFilterDebug,
    },
  };
}

// ─── helper used by the chat route to build the profileText input ──────────

export function buildProfileText(input: {
  fieldOfStudy?: string | null;
  degreeTarget?: string | null;
  targetCountries?: string[];
  fundingPreference?: string | null;
  nationality?: string | null;
  gpa?: number | string | null;
  gpaScale?: number | null;
  ielts?: number | null;
  toefl?: number | null;
  sat?: number | null;
  projectExperience?: string | null;
  extracurricularActivities?: string | null;
  profileSummary?: string;
}): string {
  const parts: string[] = [];
  if (input.profileSummary?.trim()) parts.push(input.profileSummary.trim());
  if (input.fieldOfStudy) parts.push(`Field: ${input.fieldOfStudy}.`);
  if (input.degreeTarget) parts.push(`Degree target: ${input.degreeTarget}.`);
  if (input.targetCountries?.length) parts.push(`Target countries: ${input.targetCountries.join(", ")}.`);
  if (input.fundingPreference && input.fundingPreference !== "unspecified") {
    parts.push(`Funding preference: ${input.fundingPreference}.`);
  }
  if (input.nationality) parts.push(`Nationality: ${input.nationality}.`);
  if (input.gpa !== undefined && input.gpa !== null && String(input.gpa).trim()) {
    parts.push(`GPA: ${input.gpa}${input.gpaScale ? `/${input.gpaScale}` : ""}.`);
  }
  if (input.ielts !== undefined && input.ielts !== null) parts.push(`IELTS: ${input.ielts}.`);
  if (input.toefl !== undefined && input.toefl !== null) parts.push(`TOEFL: ${input.toefl}.`);
  if (input.sat !== undefined && input.sat !== null) parts.push(`SAT: ${input.sat}.`);
  if (input.projectExperience?.trim()) parts.push(`Projects: ${input.projectExperience.trim()}`);
  if (input.extracurricularActivities?.trim()) parts.push(`Extracurriculars: ${input.extracurricularActivities.trim()}`);
  return parts.join(" ");
}
