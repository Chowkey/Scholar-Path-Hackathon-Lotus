import type { LanguageRequirements, Scholarship } from "@/lib/types";
import { normalizeCountry, normalizeDegreeLevel } from "@/lib/scholarshipOptions";

export type ScholarshipRow = {
  id: string;
  name: string;
  country: string;
  flag: string;
  organization: string;
  degree: string;
  funding: string;
  field_of_study: string;
  academic_requirements: string;
  language_requirements: unknown;
  other_requirements: string;
  deadline: string;
  description: string;
  link: string;
  source_name: string;
  source_url: string;
  created_at?: string;
  updated_at?: string;
};

const EMPTY_LANGUAGE_REQUIREMENTS: LanguageRequirements = {
  other: [],
};

function normalizeFieldText(value: string | null | undefined): string {
  if (!value) {
    return "Not specified";
  }
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
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeLanguageRequirements(value: unknown): LanguageRequirements {
  if (!value || typeof value !== "object") {
    return EMPTY_LANGUAGE_REQUIREMENTS;
  }

  const candidate = value as Partial<LanguageRequirements>;
  const output: LanguageRequirements = {
    other: normalizeStringArray(candidate.other),
  };

  if (typeof candidate.ielts === "string" && candidate.ielts.trim()) {
    output.ielts = candidate.ielts.trim();
  }
  if (typeof candidate.toefl === "string" && candidate.toefl.trim()) {
    output.toefl = candidate.toefl.trim();
  }
  if (typeof candidate.pte === "string" && candidate.pte.trim()) {
    output.pte = candidate.pte.trim();
  }
  if (typeof candidate.duolingo === "string" && candidate.duolingo.trim()) {
    output.duolingo = candidate.duolingo.trim();
  }

  return output;
}

export function rowToScholarship(row: ScholarshipRow): Scholarship {
  return {
    id: row.id,
    name: row.name,
    country: normalizeCountry(row.country),
    flag: row.flag ?? "",
    organization: normalizeFieldText(row.organization),
    degree: normalizeDegreeLevel(row.degree),
    funding: normalizeFieldText(row.funding),
    field: normalizeFieldText(row.field_of_study),
    academicRequirements: normalizeFieldText(row.academic_requirements),
    languageRequirements: normalizeLanguageRequirements(row.language_requirements),
    otherRequirements: normalizeFieldText(row.other_requirements),
    deadline: normalizeFieldText(row.deadline),
    description: normalizeFieldText(row.description),
    link: row.link,
    sourceName: row.source_name ?? "",
    sourceUrl: row.source_url ?? "",
  };
}

export function scholarshipToRow(value: Scholarship): ScholarshipRow {
  return {
    id: value.id,
    name: value.name,
    country: normalizeCountry(value.country),
    flag: value.flag ?? "",
    organization: value.organization,
    degree: normalizeDegreeLevel(value.degree),
    funding: value.funding,
    field_of_study: value.field,
    academic_requirements: value.academicRequirements ?? "",
    language_requirements: normalizeLanguageRequirements(value.languageRequirements),
    other_requirements: value.otherRequirements ?? "",
    deadline: value.deadline,
    description: value.description,
    link: value.link,
    source_name: value.sourceName ?? "",
    source_url: value.sourceUrl ?? "",
  };
}
