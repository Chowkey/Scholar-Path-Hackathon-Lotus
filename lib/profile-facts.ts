import type { FactInput, FactValue, StoredFact } from "@/lib/user-facts";
import type { ProfileFormData } from "@/lib/types";

/**
 * Canonical keys for facts the app writes about a user.
 * Single source of truth — both the chat extractor and the evaluator
 * form persist into these keys, and both the chat prompt and the
 * evaluator prefill read from them.
 */
export const PROFILE_FACT_KEYS = {
  educationLevel: "education_level",        // "high_school" | "undergraduate" | "graduate"
  degreeTarget:   "degree_target",          // "undergraduate" | "masters" | "phd"
  fieldOfStudy:   "field_of_study",         // string
  nationality:    "nationality",            // string
  gpa:            "gpa",                    // number
  gpaScale:       "gpa_scale",              // 4 | 10 | 100
  ielts:          "ielts",                  // number
  toefl:          "toefl",                  // number
  sat:            "sat",                    // number
  projectExperience:        "project_experience",         // string (long-form)
  extracurricularActivities:"extracurricular_activities", // string (long-form)
  // Chat-only (not on evaluator form):
  fundingPreference: "funding_preference",  // "full" | "partial_or_full" | "unspecified"
  targetCountries:   "target_countries",    // string[]
} as const;

/** Map ProfileFormData (evaluator form) -> facts to persist. */
export function evaluatorProfileToFacts(profile: ProfileFormData, source: string): FactInput[] {
  const facts: FactInput[] = [];
  const push = (key: string, value: FactValue) => facts.push({ key, value, source });

  push(PROFILE_FACT_KEYS.educationLevel, profile.educationLevel);
  push(PROFILE_FACT_KEYS.degreeTarget, profile.degreeTarget);
  if (profile.gpa && profile.gpa > 0) push(PROFILE_FACT_KEYS.gpa, profile.gpa);
  if (profile.gpaScale) push(PROFILE_FACT_KEYS.gpaScale, profile.gpaScale);
  if (profile.ielts !== undefined && profile.ielts !== null) push(PROFILE_FACT_KEYS.ielts, profile.ielts);
  if (profile.toefl !== undefined && profile.toefl !== null) push(PROFILE_FACT_KEYS.toefl, profile.toefl);
  if (profile.sat !== undefined && profile.sat !== null) push(PROFILE_FACT_KEYS.sat, profile.sat);
  if (profile.nationality) push(PROFILE_FACT_KEYS.nationality, profile.nationality);
  if (profile.fieldOfStudy) push(PROFILE_FACT_KEYS.fieldOfStudy, profile.fieldOfStudy);
  if (profile.projectExperience?.trim()) push(PROFILE_FACT_KEYS.projectExperience, profile.projectExperience.trim());
  if (profile.extracurricularActivities?.trim()) push(PROFILE_FACT_KEYS.extracurricularActivities, profile.extracurricularActivities.trim());

  return facts;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

function asGpaScale(v: unknown): 4 | 10 | 100 | undefined {
  const n = asNumber(v);
  if (n === 4 || n === 10 || n === 100) return n;
  return undefined;
}

/** Map stored facts (record form) -> partial ProfileFormData for prefill. */
export function factsToEvaluatorProfile(facts: Record<string, unknown>): Partial<ProfileFormData> {
  const out: Partial<ProfileFormData> = {};

  const educationLevel = asString(facts[PROFILE_FACT_KEYS.educationLevel]);
  if (educationLevel === "high_school" || educationLevel === "undergraduate" || educationLevel === "graduate") {
    out.educationLevel = educationLevel;
  }
  const degreeTarget = asString(facts[PROFILE_FACT_KEYS.degreeTarget]);
  if (degreeTarget === "undergraduate" || degreeTarget === "masters" || degreeTarget === "phd") {
    out.degreeTarget = degreeTarget;
  }

  const nationality = asString(facts[PROFILE_FACT_KEYS.nationality]);
  if (nationality) out.nationality = nationality;

  const fieldOfStudy = asString(facts[PROFILE_FACT_KEYS.fieldOfStudy]);
  if (fieldOfStudy) out.fieldOfStudy = fieldOfStudy;

  const gpa = asNumber(facts[PROFILE_FACT_KEYS.gpa]);
  if (gpa !== undefined) out.gpa = gpa;

  const gpaScale = asGpaScale(facts[PROFILE_FACT_KEYS.gpaScale]);
  if (gpaScale) out.gpaScale = gpaScale;

  const ielts = asNumber(facts[PROFILE_FACT_KEYS.ielts]);
  if (ielts !== undefined) out.ielts = ielts;

  const toefl = asNumber(facts[PROFILE_FACT_KEYS.toefl]);
  if (toefl !== undefined) out.toefl = toefl;

  const sat = asNumber(facts[PROFILE_FACT_KEYS.sat]);
  if (sat !== undefined) out.sat = sat;

  const projectExperience = asString(facts[PROFILE_FACT_KEYS.projectExperience]);
  if (projectExperience) out.projectExperience = projectExperience;

  const extracurricularActivities = asString(facts[PROFILE_FACT_KEYS.extracurricularActivities]);
  if (extracurricularActivities) out.extracurricularActivities = extracurricularActivities;

  return out;
}

export type { StoredFact };
