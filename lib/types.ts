export type Message = {
  role: "user" | "assistant";
  content: string;
  isRoadmap?: boolean;
};

export type RoadmapData = {
  scholarships: { name: string; country: string; deadline: string }[];
  nextSteps: string[];
};

export type LanguageRequirements = {
  ielts?: string;
  toefl?: string;
  pte?: string;
  duolingo?: string;
  other: string[];
};

export type FundingKind =
  | "full_tuition_plus_stipend"
  | "full_tuition_only"
  | "partial"
  | "stipend_only"
  | "allowance"
  | "unspecified";

export type FundingAmountPeriod = "per_year" | "per_month" | "one_time" | "none";

export type Scholarship = {
  id: string;
  name: string;
  country: string;
  flag: string;
  organization: string;
  universities?: string[]; // Specific universities where the scholarship can be used
  degree: string;
  funding: string;
  fundingKind?: FundingKind;
  fundingAmountValue?: number | null;
  fundingAmountCurrency?: string | null;
  fundingAmountPeriod?: FundingAmountPeriod;
  field: string;
  academicRequirements: string;
  languageRequirements: LanguageRequirements;
  otherRequirements: string;
  deadline: string;
  description: string;
  link: string;
  sourceName?: string;
  sourceUrl?: string;
};

export type ProfileFormData = {
  educationLevel: "high_school" | "undergraduate" | "graduate";
  gpa: number;
  gpaScale: 4 | 10 | 100;
  ielts?: number;
  toefl?: number;
  sat?: number;
  nationality: string;
  fieldOfStudy: string;
  degreeTarget: "undergraduate" | "masters" | "phd";
  projectExperience?: string;
  extracurricularActivities?: string;
};

export type EvaluationGap = {
  field: string;
  current: string;
  required: string;
  advice: string;
};

export type EvaluationResult = {
  scholarshipId: string;
  scholarshipName: string;
  trafficLight: "green" | "yellow" | "red";
  matchPercent: number;
  strengths: string[];
  gaps: EvaluationGap[];
  verdict: string;
  // Optional fields populated when enriched with school/acceptance rate data
  universityData?: Array<{
    name: string;
    acceptanceRate: number | null;
  }>;
  competitivenessLevel?: "Very Selective" | "Highly Selective" | "Selective" | "Moderately Selective" | "Unknown";
};

export type UserInfo = {
  nationality?: string;
  currentLocation?: string;
  fieldOfStudy?: string;
  targetDegree?: "undergraduate" | "masters" | "phd";
  interests?: string[];
  languages?: string[];
  currentSchool?: string;
};

export type AlumniSearchInput = {
  dreamUniversity: string;
  user: UserInfo;
  limit?: number;
  model?: string;
};

export type AlumniMatch = {
  name: string;
  profileUrl: string;
  university: string;
  currentSchool?: string;
  recentMatching?: string;
  headline?: string;
  location?: string;
  graduation?: string;
  matchReasons: string[];
  confidence: "high" | "medium" | "low";
  sources: Array<{
    url: string;
    note: string;
  }>;
};

export type AlumniSearchResult = {
  dreamUniversity: string;
  alumni: AlumniMatch[];
};
