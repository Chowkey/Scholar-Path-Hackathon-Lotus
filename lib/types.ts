export type Message = {
  role: "user" | "assistant";
  content: string;
  isRoadmap?: boolean;
};

export type RoadmapData = {
  scholarships: { name: string; country: string; deadline: string }[];
  nextSteps: string[];
};

export type Scholarship = {
  id: string;
  name: string;
  country: string;
  flag: string;
  organization: string;
  degree: ("undergraduate" | "masters" | "phd")[];
  funding: "full" | "partial";
  fields: string[];
  deadline: string;
  description: string;
  requirements: {
    gpa?: string;
    ielts?: string;
    toefl?: string;
    essays: string[];
    other: string[];
  };
  link: string;
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
