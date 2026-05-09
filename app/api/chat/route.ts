import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";
import { createServerClient } from "@/lib/supabase/server";
import { createBrowserClient } from "@/lib/supabase";
import { createSession, persistTurn } from "@/lib/chat-sessions";
import { listFactsAsRecord, upsertFacts, type FactInput } from "@/lib/user-facts";
import { PROFILE_FACT_KEYS } from "@/lib/profile-facts";
import {
  rowToScholarship,
  SCHOLARSHIP_SELECT,
  type ScholarshipJoinedRow,
} from "@/lib/scholarshipTransform";
import { studyAbroadKnowledge } from "@/lib/study-abroad-knowledge";
import type { Scholarship } from "@/lib/types";

const INTENT_PROMPT = `Classify the student's latest need in a study-abroad counseling chat.

Possible intents:
- concept_explainer: asks what a concept means, such as SOP, IELTS, recommendation letters, visa, timeline
- application_guidance: asks what they need, what steps to follow, what documents or certificates are required
- personalized_matching: wants recommendations tailored to their profile, country, field, budget, or scholarship fit
- latest_info: asks for current deadlines, latest rules, current requirements, recent changes, or official updates

Rules:
- Use the latest user message as the main signal, but consider prior context.
- needsWebSearch should be true for time-sensitive or likely-changing information.
- shouldUseScholarshipMatching should be true only when the student is asking for personalized options.
- shouldUseKnowledgeBase should be true for concept or process guidance.
- responseGoal should be one short sentence describing what the assistant should achieve next.`;

const PROFILE_EXTRACTION_PROMPT = `Extract the student's study-abroad planning state from the
conversation. Use only information explicitly stated or strongly implied by the user.

You will receive an input JSON with both "messages" (the conversation) and "knownUserFacts"
(facts already on file from prior sessions, e.g. nationality, GPA, degree target, field).

Rules:
- Do not invent facts.
- Keep unknown values as null or empty arrays.
- Treat knownUserFacts as already established. Do NOT mark them as missing, and do NOT propose a
  "nextBestQuestion" that re-asks any field already present in knownUserFacts.
- Track both scholarship-fit details and broader study-abroad process needs.
- "gpa" should be the GPA as the user stated it (string), e.g. "3.8" or "8.5".
- "gpaScale" must be 4, 10, or 100 — infer from the GPA value or the user's statement; null if unclear.
- "sat" only when the user gives a numeric SAT score (max 1600).
- "projectExperience" should be a short markdown summary of any concrete projects, portfolio work,
  research, or internships the user mentions; null if none discussed.
- "extracurricularActivities" should be a short markdown summary of clubs, volunteering, leadership,
  competitions, community work; null if none discussed.
- "enoughInfoForRecommendations" should be true only if you have at least:
  degree target, preferred country/region, preferred field, and funding preference.
- "needsGeneralGuidance" should be true if the user is mainly confused about process, documents,
  certificates, application order, or country choice.
- "confusionAreas" should list what the student still seems unclear about.
- "specificityLevel" should be "low" when the student's answer is vague and needs narrowing.
- "nextBestQuestion" must advance beyond knownUserFacts — pick a deeper, related insight to surface
  next (e.g. project/research interests, target universities, intake term, English test status,
  specialization, work-after-study goals) rather than re-asking what is already known.
- "generalQuestionToAnswer" should summarize any process question the user asked that deserves
  a direct answer before continuing intake.`;

const KB_RESPONSE_PROMPT = `You are ScholarPath Counselor, a warm and practical study-abroad advisor.

You will receive:
- the conversation planning summary
- knownUserFacts: previously remembered facts about this user (e.g. nationality, GPA, degree target, field, target country, IELTS, projects). Treat these as known — do not re-ask for them unless the user contradicts them.
- retrieved local knowledge snippets from ScholarPath's database
- optionally a shortlist of validated scholarships

Rules:
- Before writing your reply, scan knownUserFacts. Acknowledge what you already know about the student briefly (e.g. "Given your 3.6 GPA in CS and Vietnamese nationality...") so they feel heard.
- NEVER ask the student for a fact that already exists in knownUserFacts. If the fact is present, treat it as settled.
- Your follow-up question must move the conversation FORWARD into deeper, related insight — not repeat ground already covered. Examples of good forward questions when basics are known:
  - if GPA + field are known → ask about specific project/research interests, target university tier, or English test status
  - if country + budget are known → ask about preferred intake (Fall/Spring), language preferences, or work-after-study goals
  - if degree target + field are known → ask about specialization, faculty/lab interests, or thesis vs coursework preference
- Prefer the local knowledge snippets as your primary source of truth.
- Answer concept and process questions clearly and directly.
- If the student's question is vague, explain what is still unclear and ask exactly one focused follow-up question that advances beyond knownUserFacts.
- If enough profile information is available and the user wants personalized options, you may recommend scholarships from the validated shortlist only.
- You may use light Markdown: short headings, bold text, bullet lists, numbered lists, inline code, and links.
- Do not invent scholarship names or official rules not supported by the provided context.
- If local knowledge may be incomplete for a changing topic, state that the student should verify official sources.`;

const WEB_RESPONSE_PROMPT = `You are ScholarPath Counselor, a warm and practical study-abroad advisor.

You will receive:
- the conversation planning summary
- knownUserFacts: previously remembered facts about this user (e.g. nationality, GPA, degree target, field, target country, IELTS, projects). Treat these as known — do not re-ask for them unless the user contradicts them.
- optional local knowledge snippets
- optional validated scholarship shortlist

Rules:
- Before writing your reply, scan knownUserFacts. Briefly acknowledge what you already know about the student so they feel heard, then build on it.
- NEVER ask the student for a fact that already exists in knownUserFacts. If the fact is present, treat it as settled.
- Your follow-up question must move the conversation FORWARD into deeper, related insight — not repeat ground already covered (e.g. if GPA and field are already known, ask about projects, target universities, intake, or English test status instead).
- Use web search for up-to-date or official information.
- Prefer official university, embassy, immigration, scholarship, or government sources when possible.
- Give a practical answer first, then list source links the student can check.
- If the user is vague, ask exactly one focused follow-up question after the answer that advances beyond knownUserFacts.
- If scholarship recommendations are included, only use the validated shortlist provided to you.
- You may use light Markdown.
- Do not use roadmap markers in assistantMessage.`;

const INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ["concept_explainer", "application_guidance", "personalized_matching", "latest_info"],
    },
    needsWebSearch: { type: "boolean" },
    shouldUseKnowledgeBase: { type: "boolean" },
    shouldUseScholarshipMatching: { type: "boolean" },
    responseGoal: { type: "string" },
  },
  required: [
    "intent",
    "needsWebSearch",
    "shouldUseKnowledgeBase",
    "shouldUseScholarshipMatching",
    "responseGoal",
  ],
} as const;

const PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    educationLevel: {
      anyOf: [
        { type: "string", enum: ["high_school", "undergraduate", "graduate"] },
        { type: "null" },
      ],
    },
    degreeTarget: {
      anyOf: [
        { type: "string", enum: ["undergraduate", "masters", "phd"] },
        { type: "null" },
      ],
    },
    targetCountriesOrRegions: {
      type: "array",
      items: { type: "string" },
    },
    fieldOfStudy: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    nationality: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    fundingPreference: {
      anyOf: [
        { type: "string", enum: ["full", "partial_or_full", "unspecified"] },
        { type: "null" },
      ],
    },
    ielts: {
      anyOf: [{ type: "number" }, { type: "null" }],
    },
    toefl: {
      anyOf: [{ type: "number" }, { type: "null" }],
    },
    sat: {
      anyOf: [{ type: "number" }, { type: "null" }],
    },
    gpa: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    gpaScale: {
      anyOf: [{ type: "number", enum: [4, 10, 100] }, { type: "null" }],
    },
    projectExperience: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    extracurricularActivities: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    enoughInfoForRecommendations: { type: "boolean" },
    missingFields: {
      type: "array",
      items: { type: "string" },
    },
    nextBestQuestion: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    generalQuestionToAnswer: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    needsGeneralGuidance: { type: "boolean" },
    confusionAreas: {
      type: "array",
      items: { type: "string" },
    },
    specificityLevel: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    profileSummary: { type: "string" },
  },
  required: [
    "educationLevel",
    "degreeTarget",
    "targetCountriesOrRegions",
    "fieldOfStudy",
    "nationality",
    "fundingPreference",
    "ielts",
    "toefl",
    "sat",
    "gpa",
    "gpaScale",
    "projectExperience",
    "extracurricularActivities",
    "enoughInfoForRecommendations",
    "missingFields",
    "nextBestQuestion",
    "generalQuestionToAnswer",
    "needsGeneralGuidance",
    "confusionAreas",
    "specificityLevel",
    "profileSummary",
  ],
} as const;

const CHAT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    phase: {
      type: "string",
      enum: ["ask_more", "guide", "recommend"],
    },
    assistantMessage: { type: "string" },
    followUpQuestion: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    recommendedScholarshipIds: {
      type: "array",
      items: { type: "string" },
    },
    nextSteps: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "phase",
    "assistantMessage",
    "followUpQuestion",
    "recommendedScholarshipIds",
    "nextSteps",
  ],
} as const;

type ChatRequestBody = {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  sessionId?: string;
};

type ChatIntent = {
  intent: "concept_explainer" | "application_guidance" | "personalized_matching" | "latest_info";
  needsWebSearch: boolean;
  shouldUseKnowledgeBase: boolean;
  shouldUseScholarshipMatching: boolean;
  responseGoal: string;
};

type ExtractedProfile = {
  educationLevel: "high_school" | "undergraduate" | "graduate" | null;
  degreeTarget: "undergraduate" | "masters" | "phd" | null;
  targetCountriesOrRegions: string[];
  fieldOfStudy: string | null;
  nationality: string | null;
  fundingPreference: "full" | "partial_or_full" | "unspecified" | null;
  ielts: number | null;
  toefl: number | null;
  sat: number | null;
  gpa: string | null;
  gpaScale: 4 | 10 | 100 | null;
  projectExperience: string | null;
  extracurricularActivities: string | null;
  enoughInfoForRecommendations: boolean;
  missingFields: string[];
  nextBestQuestion: string | null;
  generalQuestionToAnswer: string | null;
  needsGeneralGuidance: boolean;
  confusionAreas: string[];
  specificityLevel: "low" | "medium" | "high";
  profileSummary: string;
};

type ChatResponsePayload = {
  phase: "ask_more" | "guide" | "recommend";
  assistantMessage: string;
  followUpQuestion: string | null;
  recommendedScholarshipIds: string[];
  nextSteps: string[];
};

/**
 * Map the AI-extracted profile to a list of canonical key-value facts to
 * persist for the user. Only non-null / non-empty values are returned;
 * the upsert helper handles dedupe + change-detection.
 */
function profileToFacts(profile: ExtractedProfile, sessionId: string): FactInput[] {
  const source = `chat:${sessionId}`;
  const facts: FactInput[] = [];
  if (profile.educationLevel)            facts.push({ key: PROFILE_FACT_KEYS.educationLevel,    value: profile.educationLevel,            source });
  if (profile.degreeTarget)              facts.push({ key: PROFILE_FACT_KEYS.degreeTarget,      value: profile.degreeTarget,              source });
  if (profile.fieldOfStudy)              facts.push({ key: PROFILE_FACT_KEYS.fieldOfStudy,      value: profile.fieldOfStudy,              source });
  if (profile.nationality)               facts.push({ key: PROFILE_FACT_KEYS.nationality,       value: profile.nationality,               source });
  if (profile.fundingPreference)         facts.push({ key: PROFILE_FACT_KEYS.fundingPreference, value: profile.fundingPreference,         source });
  if (profile.targetCountriesOrRegions?.length) facts.push({ key: PROFILE_FACT_KEYS.targetCountries, value: profile.targetCountriesOrRegions, source });
  if (profile.ielts !== null)            facts.push({ key: PROFILE_FACT_KEYS.ielts,             value: profile.ielts,                     source });
  if (profile.toefl !== null)            facts.push({ key: PROFILE_FACT_KEYS.toefl,             value: profile.toefl,                     source });
  if (profile.sat !== null)              facts.push({ key: PROFILE_FACT_KEYS.sat,               value: profile.sat,                       source });
  if (profile.gpa) {
    // Store as number so it stays consistent with evaluator-form writes.
    const gpaNum = Number(profile.gpa);
    facts.push({
      key: PROFILE_FACT_KEYS.gpa,
      value: Number.isFinite(gpaNum) ? gpaNum : profile.gpa,
      source,
    });
  }
  if (profile.gpaScale !== null)         facts.push({ key: PROFILE_FACT_KEYS.gpaScale,          value: profile.gpaScale,                  source });
  if (profile.projectExperience)         facts.push({ key: PROFILE_FACT_KEYS.projectExperience, value: profile.projectExperience,         source });
  if (profile.extracurricularActivities) facts.push({ key: PROFILE_FACT_KEYS.extracurricularActivities, value: profile.extracurricularActivities, source });
  return facts;
}

function formatFactsForPrompt(facts: Record<string, unknown>): string {
  const entries = Object.entries(facts);
  if (entries.length === 0) return "(no facts on file yet)";
  return entries
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join("\n");
}

type RankedScholarship = {
  id: string;
  score: number;
  reasons: string[];
};

type ScholarshipLookup = {
  scholarships: Scholarship[];
  scholarshipsById: Map<string, Scholarship>;
};

type RetrievedKnowledge = {
  id: string;
  title: string;
  category: string;
  content: string;
};

const REGION_ALIASES: Record<string, string[]> = {
  europe: ["europe", "eu", "european union"],
  usa: ["usa", "us", "united states", "america", "u.s."],
  uk: ["uk", "united kingdom", "britain", "england"],
  australia: ["australia"],
  japan: ["japan"],
  germany: ["germany"],
  belgium: ["belgium"],
  switzerland: ["switzerland"],
  china: ["china"],
  "south korea": ["south korea", "korea", "rok"],
  "new zealand": ["new zealand", "nz"],
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(" ").filter(Boolean);
}

function parseJsonResponse<T>(raw: string): T {
  return JSON.parse(
    raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim(),
  ) as T;
}

function includesTokenMatch(source: string, target: string): boolean {
  const normalizedSource = normalizeText(source);
  const normalizedTarget = normalizeText(target);

  return (
    normalizedSource.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedSource) ||
    tokenize(target).some((token) => token.length > 2 && normalizedSource.includes(token))
  );
}

function matchesCountryOrRegion(preferences: string[], country: string): boolean {
  const normalizedCountry = normalizeText(country);

  return preferences.some((preference) => {
    const normalizedPreference = normalizeText(preference);
    if (normalizedPreference === normalizedCountry) {
      return true;
    }

    const aliases = REGION_ALIASES[normalizedCountry] ?? [];
    return aliases.includes(normalizedPreference);
  });
}

function fieldMatches(fieldOfStudy: string | null, scholarshipField: string): boolean {
  if (!fieldOfStudy) {
    return true;
  }

  return scholarshipField.trim() === "" || includesTokenMatch(scholarshipField, fieldOfStudy);
}

async function loadScholarshipLookup(): Promise<ScholarshipLookup> {
  const db = createBrowserClient();
  const { data, error } = await db.from("scholarships").select(SCHOLARSHIP_SELECT);

  if (error) {
    throw new Error(`Failed to load scholarships: ${error.message}`);
  }

  const scholarships = ((data ?? []) as unknown as ScholarshipJoinedRow[]).map(rowToScholarship);
  return {
    scholarships,
    scholarshipsById: new Map(scholarships.map((scholarship) => [scholarship.id, scholarship])),
  };
}

function buildShortlist(profile: ExtractedProfile, scholarships: Scholarship[]): RankedScholarship[] {
  return scholarships
    .map((scholarship) => {
      let score = 0;
      const reasons: string[] = [];

      if (profile.degreeTarget) {
        if (normalizeText(scholarship.degree) === normalizeText(profile.degreeTarget)) {
          score += 45;
          reasons.push(`supports ${profile.degreeTarget} study`);
        } else {
          score -= 100;
        }
      }

      if (profile.targetCountriesOrRegions.length > 0 && matchesCountryOrRegion(profile.targetCountriesOrRegions, scholarship.country)) {
        score += 25;
        reasons.push(`matches the preferred destination (${scholarship.country})`);
      }

      if (profile.fieldOfStudy) {
        if (fieldMatches(profile.fieldOfStudy, scholarship.field)) {
          score += 20;
          reasons.push("fits the student's field interest");
        } else {
          score -= 10;
        }
      }

      if (profile.fundingPreference === "full") {
        if (scholarship.funding === "full") {
          score += 15;
          reasons.push("is fully funded");
        } else {
          score -= 20;
        }
      }

      return { id: scholarship.id, score, reasons };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function retrieveKnowledge(messages: ChatRequestBody["messages"], profile: ExtractedProfile): RetrievedKnowledge[] {
  const combined = normalizeText(
    messages
      .map((message) => message.content)
      .join(" ") + ` ${profile.confusionAreas.join(" ")} ${profile.generalQuestionToAnswer ?? ""}`,
  );

  return studyAbroadKnowledge
    .map((chunk) => {
      const score = chunk.keywords.reduce((total, keyword) => {
        return combined.includes(normalizeText(keyword)) ? total + 3 : total;
      }, 0) + (combined.includes(normalizeText(chunk.title)) ? 4 : 0);

      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ id, title, category, content }) => ({ id, title, category, content }));
}

function formatDeadlineHint(deadline: string): string {
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() < Date.now()) {
    return "Check current cycle on official site";
  }

  return deadline;
}

function buildFinalAssistantText(
  payload: ChatResponsePayload,
  scholarshipLookup: ScholarshipLookup,
): string {
  const message = payload.assistantMessage.trim();

  if (payload.phase !== "recommend") {
    return payload.followUpQuestion ? `${message}\n\n${payload.followUpQuestion}`.trim() : message;
  }

  const recommendations = payload.recommendedScholarshipIds
    .map((id) => scholarshipLookup.scholarshipsById.get(id))
    .filter((value): value is Scholarship => Boolean(value));
  if (recommendations.length === 0) {
    return payload.followUpQuestion ? `${message}\n\n${payload.followUpQuestion}`.trim() : message;
  }

  const sourceLines = recommendations
    .map((scholarship) => `- [${scholarship.name}](${scholarship.link})`)
    .join("\n");
  const roadmapLines = recommendations
    .map((scholarship) => `- ${scholarship.name} | ${scholarship.country} | ${formatDeadlineHint(scholarship.deadline)}`)
    .join("\n");
  const nextSteps = payload.nextSteps.slice(0, 5).map((step, index) => `${index + 1}. ${step}`).join("\n");

  return [
    message,
    "",
    "## Official Sources",
    sourceLines,
    "",
    "##ROADMAP##",
    roadmapLines,
    nextSteps,
    "##END##",
  ]
    .filter(Boolean)
    .join("\n");
}

async function extractIntent(body: ChatRequestBody): Promise<ChatIntent> {
  const openai = getOpenAIClient();
  const response = await openai.responses.create({
    model: process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4-mini",
    instructions: INTENT_PROMPT,
    input: JSON.stringify(body.messages),
    text: {
      format: {
        type: "json_schema",
        name: "chat_intent",
        schema: INTENT_SCHEMA,
        strict: true,
      },
    },
  });

  return parseJsonResponse<ChatIntent>(response.output_text ?? "");
}

async function extractProfile(
  body: ChatRequestBody,
  knownUserFacts: Record<string, unknown> = {},
): Promise<ExtractedProfile> {
  const openai = getOpenAIClient();
  const response = await openai.responses.create({
    model: process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4-mini",
    instructions: PROFILE_EXTRACTION_PROMPT,
    input: JSON.stringify({ messages: body.messages, knownUserFacts }),
    text: {
      format: {
        type: "json_schema",
        name: "chat_profile_state",
        schema: PROFILE_SCHEMA,
        strict: true,
      },
    },
  });

  return parseJsonResponse<ExtractedProfile>(response.output_text ?? "");
}

async function generateKnowledgeResponse(
  profile: ExtractedProfile,
  intent: ChatIntent,
  knowledge: RetrievedKnowledge[],
  shortlist: RankedScholarship[],
  scholarshipLookup: ScholarshipLookup,
  knownFactsText: string,
): Promise<ChatResponsePayload> {
  const openai = getOpenAIClient();
  const shortlistPayload = shortlist.map((item) => {
    const scholarship = scholarshipLookup.scholarshipsById.get(item.id);

    return {
      id: item.id,
      name: scholarship?.name,
      country: scholarship?.country,
      degree: scholarship?.degree,
      funding: scholarship?.funding,
      field: scholarship?.field,
      officialLink: scholarship?.link,
      fitReasons: item.reasons,
    };
  });

  const response = await openai.responses.create({
    model: process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4-mini",
    instructions: KB_RESPONSE_PROMPT,
    input: JSON.stringify({
      intent,
      profile,
      knownUserFacts: knownFactsText,
      localKnowledge: knowledge,
      validatedScholarships: shortlistPayload,
      recommendationMode:
        intent.shouldUseScholarshipMatching &&
        profile.enoughInfoForRecommendations &&
        profile.specificityLevel !== "low" &&
        shortlistPayload.length > 0,
    }),
    text: {
      format: {
        type: "json_schema",
        name: "chat_kb_reply",
        schema: CHAT_RESPONSE_SCHEMA,
        strict: true,
      },
    },
    max_output_tokens: 1200,
  });

  return parseJsonResponse<ChatResponsePayload>(response.output_text ?? "");
}

async function generateWebFallbackResponse(
  body: ChatRequestBody,
  profile: ExtractedProfile,
  intent: ChatIntent,
  knowledge: RetrievedKnowledge[],
  shortlist: RankedScholarship[],
  scholarshipLookup: ScholarshipLookup,
  knownFactsText: string,
): Promise<ChatResponsePayload> {
  const openai = getOpenAIClient();
  const shortlistPayload = shortlist.map((item) => {
    const scholarship = scholarshipLookup.scholarshipsById.get(item.id);
    return {
      id: item.id,
      name: scholarship?.name,
      country: scholarship?.country,
      funding: scholarship?.funding,
      officialLink: scholarship?.link,
      fitReasons: item.reasons,
    };
  });

  const latestUserMessage = [...body.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const response = await openai.responses.create({
    model: process.env.OPENAI_CHAT_MODEL ?? "gpt-5.4-mini",
    instructions: WEB_RESPONSE_PROMPT,
    input: JSON.stringify({
      latestUserMessage,
      profile,
      intent,
      knownUserFacts: knownFactsText,
      localKnowledge: knowledge,
      validatedScholarships: shortlistPayload,
      note: "For web-based answers, include 2-5 Markdown links to the most relevant official sources you used.",
    }),
    tools: [{ type: "web_search_preview" }],
    text: {
      format: {
        type: "json_schema",
        name: "chat_web_reply",
        schema: CHAT_RESPONSE_SCHEMA,
        strict: true,
      },
    },
    max_output_tokens: 1200,
  });

  return parseJsonResponse<ChatResponsePayload>(response.output_text ?? "");
}

function validateRecommendations(
  payload: ChatResponsePayload,
  shortlist: RankedScholarship[],
  profile: ExtractedProfile,
  intent: ChatIntent,
): ChatResponsePayload {
  const allowedIds = new Set(shortlist.map((item) => item.id));
  const recommendedScholarshipIds = payload.recommendedScholarshipIds.filter((id) => allowedIds.has(id)).slice(0, 5);

  if (
    payload.phase === "recommend" &&
    (!intent.shouldUseScholarshipMatching || !profile.enoughInfoForRecommendations || profile.specificityLevel === "low")
  ) {
    return {
      phase: profile.needsGeneralGuidance ? "guide" : "ask_more",
      assistantMessage:
        payload.assistantMessage ||
        "I can help with that, but I still need to narrow a few details before giving strong scholarship suggestions.",
      followUpQuestion:
        profile.nextBestQuestion ??
        "Which country, degree level, and field are you currently considering most seriously?",
      recommendedScholarshipIds: [],
      nextSteps: [],
    };
  }

  if (payload.phase === "recommend" && recommendedScholarshipIds.length === 0) {
    return {
      phase: "ask_more",
      assistantMessage:
        "I can point you in the right direction, but I want one more detail before I recommend the strongest scholarship matches.",
      followUpQuestion: profile.nextBestQuestion ?? "Which country or region do you most want to study in?",
      recommendedScholarshipIds: [],
      nextSteps: [],
    };
  }

  return {
    ...payload,
    recommendedScholarshipIds,
    nextSteps: payload.nextSteps.slice(0, 5),
  };
}

async function streamText(text: string): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      const chunks = text.match(/.{1,140}(\s|$)|.+$/g) ?? [text];
      let index = 0;

      const pump = () => {
        if (index >= chunks.length) {
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(chunks[index]!));
        index += 1;
        setTimeout(pump, 12);
      };

      pump();
    },
  });
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in to use the counselor." }, { status: 401 });
    }

    const body = (await request.json()) as ChatRequestBody;
    let sessionId = body.sessionId;
    if (!sessionId) {
      const created = await createSession(supabase, user.id);
      sessionId = created.id;
    }

    const [intent, scholarshipLookup, knownFacts] = await Promise.all([
      extractIntent(body),
      loadScholarshipLookup(),
      listFactsAsRecord(supabase, user.id),
    ]);
    const profile = await extractProfile(body, knownFacts);
    const shortlist = intent.shouldUseScholarshipMatching
      ? buildShortlist(profile, scholarshipLookup.scholarships)
      : [];
    const knowledge = intent.shouldUseKnowledgeBase ? retrieveKnowledge(body.messages, profile) : [];
    const factsBlock = formatFactsForPrompt(knownFacts);

    const rawPayload = intent.needsWebSearch
      ? await generateWebFallbackResponse(body, profile, intent, knowledge, shortlist, scholarshipLookup, factsBlock)
      : await generateKnowledgeResponse(profile, intent, knowledge, shortlist, scholarshipLookup, factsBlock);

    const payload = validateRecommendations(rawPayload, shortlist, profile, intent);
    const finalAssistantText = buildFinalAssistantText(payload, scholarshipLookup);

    await Promise.all([
      persistTurn(supabase, sessionId, {
        messages: [...body.messages, { role: "assistant", content: finalAssistantText }],
        profile: {
          ...profile,
          intent,
          retrievedKnowledgeIds: knowledge.map((item) => item.id),
        },
        shortlistIds: shortlist.map((item) => item.id),
        recommendations: payload.recommendedScholarshipIds,
      }),
      upsertFacts(supabase, user.id, profileToFacts(profile, sessionId)),
    ]);

    const readable = await streamText(finalAssistantText);

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Session-Id": sessionId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start chat stream.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
