import type { LanguageRequirements, Scholarship } from "@/lib/types";
import { normalizeCountry, normalizeDegreeLevel } from "@/lib/scholarshipOptions";

/**
 * Shape returned by Supabase when querying scholarships joined with their
 * lookup tables. Use the SELECT string from `SCHOLARSHIP_SELECT` so the
 * shape stays in sync with the query.
 */
export type ScholarshipJoinedRow = {
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
  country: { id: string; name: string; flag_url: string } | null;
  organization: { id: string; name: string } | null;
  scholarship_fields:
    | Array<{ field: { id: string; name: string } | null }>
    | null;
};

/**
 * Canonical SELECT string for joined scholarship reads.
 * Use with: `db.from("scholarships").select(SCHOLARSHIP_SELECT)`.
 */
export const SCHOLARSHIP_SELECT = `
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
  country:countries ( id, name, flag_url ),
  organization:organizations ( id, name ),
  scholarship_fields ( field:fields ( id, name ) )
`;

const EMPTY_LANGUAGE_REQUIREMENTS: LanguageRequirements = { other: [] };

function normalizeFieldText(value: string | null | undefined): string {
  if (!value) return "Not specified";
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  if (
    lower === "see source" ||
    lower === "see below" ||
    lower === "details on award page" ||
    lower === "not specified"
  ) {
    return "Not specified";
  }
  return normalized;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeLanguageRequirements(value: unknown): LanguageRequirements {
  if (!value || typeof value !== "object") return EMPTY_LANGUAGE_REQUIREMENTS;
  const candidate = value as Partial<LanguageRequirements>;
  const output: LanguageRequirements = { other: normalizeStringArray(candidate.other) };
  if (typeof candidate.ielts === "string" && candidate.ielts.trim()) output.ielts = candidate.ielts.trim();
  if (typeof candidate.toefl === "string" && candidate.toefl.trim()) output.toefl = candidate.toefl.trim();
  if (typeof candidate.pte === "string" && candidate.pte.trim()) output.pte = candidate.pte.trim();
  if (typeof candidate.duolingo === "string" && candidate.duolingo.trim()) output.duolingo = candidate.duolingo.trim();
  return output;
}

type RequirementsJson = {
  academic?: string;
  language?: unknown;
  other?: string;
};

export function rowToScholarship(row: ScholarshipJoinedRow): Scholarship {
  const requirements = (row.requirements ?? {}) as RequirementsJson;
  const fieldNames = (row.scholarship_fields ?? [])
    .map((entry) => entry.field?.name)
    .filter((name): name is string => Boolean(name));
  const primaryField = fieldNames[0] ?? "Not specified";

  return {
    id: row.id,
    name: row.name,
    country: normalizeCountry(row.country?.name ?? "Unknown"),
    flag: row.country?.flag_url ?? "",
    organization: normalizeFieldText(row.organization?.name),
    degree: normalizeDegreeLevel(row.degree),
    funding: normalizeFieldText(row.funding),
    field: normalizeFieldText(primaryField),
    academicRequirements: normalizeFieldText(requirements.academic),
    languageRequirements: normalizeLanguageRequirements(requirements.language),
    otherRequirements: normalizeFieldText(requirements.other),
    deadline: normalizeFieldText(row.deadline),
    description: normalizeFieldText(row.description),
    link: row.link,
    sourceName: row.source_name ?? "",
    sourceUrl: row.source_url ?? "",
  };
}

/**
 * Build the requirements jsonb payload for inserts/updates from the app's
 * Scholarship shape.
 */
export function buildRequirementsJson(value: Scholarship): RequirementsJson {
  return {
    academic: value.academicRequirements ?? "",
    language: normalizeLanguageRequirements(value.languageRequirements),
    other: value.otherRequirements ?? "",
  };
}
