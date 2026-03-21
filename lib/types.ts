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
