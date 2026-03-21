export type KnowledgeChunk = {
  id: string;
  title: string;
  category: "concept" | "documents" | "timeline" | "tests" | "applications" | "finance";
  content: string;
  keywords: string[];
};

export const studyAbroadKnowledge: KnowledgeChunk[] = [
  {
    id: "sop-basics",
    title: "What an SOP is",
    category: "concept",
    keywords: ["sop", "statement of purpose", "personal statement", "motivation letter", "essay"],
    content:
      "A Statement of Purpose (SOP) explains why you want the program, why you are a good fit, what academic or professional experiences prepared you, and what goals you plan to pursue after graduation. A strong SOP is specific, evidence-based, and tailored to the university or scholarship rather than generic.",
  },
  {
    id: "lor-basics",
    title: "Recommendation letters",
    category: "applications",
    keywords: ["lor", "recommendation", "reference letter", "referee"],
    content:
      "Recommendation letters usually come from professors, supervisors, or mentors who know your work well. Strong letters include concrete examples of your academic ability, research skills, leadership, communication, or professional impact. Students should ask recommenders early and provide their CV, draft SOP, and deadline list.",
  },
  {
    id: "common-documents",
    title: "Common study abroad documents",
    category: "documents",
    keywords: ["documents", "required", "requirements", "certificate", "certificates", "needed", "apply"],
    content:
      "Common application materials for studying abroad include transcripts, degree certificate or expected graduation proof, passport, CV or resume, Statement of Purpose, recommendation letters, language test results such as IELTS or TOEFL when required, and sometimes a portfolio, research proposal, or writing sample. Scholarships may also require financial forms, leadership essays, or work experience evidence.",
  },
  {
    id: "english-tests",
    title: "English test guidance",
    category: "tests",
    keywords: ["ielts", "toefl", "english", "duolingo", "pte", "language test"],
    content:
      "Many universities and scholarships require proof of English proficiency unless the student qualifies for a waiver. IELTS and TOEFL are the most common. Typical master's applications often expect around IELTS 6.5 or TOEFL iBT 80 to 100, but exact thresholds vary by institution and program. Students should always verify the official requirement for the specific university and scholarship.",
  },
  {
    id: "application-timeline",
    title: "Typical application timeline",
    category: "timeline",
    keywords: ["timeline", "when", "start", "deadline", "planning", "months"],
    content:
      "A typical study abroad timeline starts 9 to 15 months before enrollment. Students usually begin by shortlisting countries and programs, preparing tests, drafting SOPs, and requesting recommendation letters. Scholarship deadlines often come earlier than university admission deadlines, so planning backwards from the earliest deadline is important.",
  },
  {
    id: "country-choice",
    title: "How to choose a country",
    category: "concept",
    keywords: ["country", "which country", "choose", "destination", "where to study"],
    content:
      "Choosing a study destination depends on budget, scholarship availability, post-study goals, field strength, language requirements, and lifestyle preference. A practical way to compare countries is to look at tuition and living costs, scholarship chances, visa policy, language expectations, and whether the country is strong in the student's intended field.",
  },
  {
    id: "scholarship-vs-admission",
    title: "University admission vs scholarship applications",
    category: "applications",
    keywords: ["scholarship", "admission", "difference", "separate", "apply"],
    content:
      "University admission and scholarship applications are sometimes separate and sometimes linked. Some scholarships require students to first gain university admission, while others review both together. Students should verify whether they need one application, two parallel applications, or a nomination through an embassy or institution.",
  },
  {
    id: "visa-basics",
    title: "Visa basics",
    category: "applications",
    keywords: ["visa", "student visa", "embassy", "proof of funds"],
    content:
      "Student visa processes usually happen after admission and often after scholarship confirmation. Common visa requirements include an admission letter, passport, proof of funds or scholarship award, medical or insurance documents, photographs, and visa forms. Exact rules are country-specific and should always be checked on the official embassy or immigration website.",
  },
  {
    id: "budgeting",
    title: "Budget and funding planning",
    category: "finance",
    keywords: ["budget", "funding", "cost", "living expenses", "tuition", "fully funded"],
    content:
      "Students should separate total cost into tuition, living expenses, insurance, visa, travel, and initial settlement costs. Fully funded scholarships usually cover tuition and living support, but the exact package differs. When funding is limited, students should prioritize countries and programs with lower tuition or stronger scholarship coverage.",
  },
];
