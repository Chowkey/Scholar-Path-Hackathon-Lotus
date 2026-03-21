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

export type Scholarship = {
  id: string;
  name: string;
  country: string;
  flag: string;
  organization: string;
  degree: string;
  funding: string;
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
