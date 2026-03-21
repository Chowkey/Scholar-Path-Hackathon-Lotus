import { getOpenAIClient } from "./openai";
import Exa from "exa-js";
import type { AlumniMatch, AlumniSearchInput, AlumniSearchResult } from "./types";

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_LIMIT = 20;

const ALUMNI_SEARCH_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    dreamUniversity: { type: "string" },
    alumni: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          profileUrl: { type: "string" },
          university: { type: "string" },
          currentSchool: { type: ["string", "null"] },
          recentMatching: { type: ["string", "null"] },
          headline: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          graduation: { type: ["string", "null"] },
          matchReasons: { type: "array", items: { type: "string" } },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          sources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                url: { type: "string" },
                note: { type: "string" }
              },
              required: ["url", "note"]
            }
          }
        },
        required: ["name", "profileUrl", "university", "currentSchool", "recentMatching", "headline", "location", "graduation", "matchReasons", "confidence", "sources"]
      }
    }
  },
  required: ["dreamUniversity", "alumni"]
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stripMarkdownFences(value: string): string {
  return value.replace(/^```json\s*|^```\s*|\s*```$/gim, "").trim();
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function dedupeByProfileUrl(matches: AlumniMatch[]): AlumniMatch[] {
  const seen = new Set<string>();
  const output: AlumniMatch[] = [];

  for (const match of matches) {
    const key = match.profileUrl.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(match);
  }

  return output;
}

async function generateSearchQueries(openai: any, input: AlumniSearchInput, model: string): Promise<string[]> {
  const prompt = `You are an expert search query generator. Generate exactly 3 different Google Dork queries searching LinkedIn profiles (site:linkedin.com/in).
Inputs:
- Dream University: ${input.dreamUniversity}
- Field of Study: ${input.user?.fieldOfStudy || "N/A"}
- Nationality: ${input.user?.nationality || "N/A"}
- Current School: ${input.user?.currentSchool || "N/A"}

Rules:
1. Always include the Dream University. Fix typos if necessary.
2. If Current School is provided, make sure at least 1-2 queries heavily target the Current School alongside the Dream University. (e.g., site:linkedin.com/in "Stanford University" "Hanoi Amsterdam")
3. Use combinations of Nationalities and Fields of Study for the other queries to cast a wide net.
4. Provide the exact string to pass to the search engine.
5. You MUST return ONLY a JSON object exactly like this: { "queries": ["query1", "query2", "query3"] }`;

  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });

  const content = response.choices[0].message?.content || '{"queries":[]}';
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed.queries) ? parsed.queries : [];
  } catch {
    return [];
  }
}

function buildInstructions(limit: number): string {
  return [
    "You are an alumni-data extraction assistant.",
    "Goal: You will be provided with raw search engine results (titles, snippets, and URLs) from multiple parallel searches. Your task is to extract concrete alumni profiles.",
    "",
    "What counts as an \"alumni profile\":",
    "- A LinkedIn profile or personal webpage from the search results that clearly indicates the person attended the dream university.",
    "",
    "Requirements:",
    `- Extract up to ${limit} alumni.`,
    "- STRICTLY use the provided search results. Do NOT hallucinate names, URLs, or information not present in the search context.",
    "- CRITICAL: Do NOT assume a person matches the Current School or Nationality just because the words appeared in the search query. You MUST verify the text snippet explicitly states they attended that Current School or hold that Nationality before claiming a match.",
    "- Do NOT include emails, phone numbers, or private contact details.",
    "",
    "Ranking Priority (Strict):",
    "Rank the extracted alumni descending from Best Match to Lowest Match based on this criteria:",
    "1. Matches Current School + Dream University",
    "2. Matches Dream University + Nationality",
    "3. Matches Dream University + Field of Study",
    "4. Matches Dream University only",
    "",
    "For each extracted alumni item:",
    "- profileUrl must exactly match the URL given in the search result.",
    "- matchReasons MUST explicitly state which of the ranking priority criteria they met (e.g. 'Both explicitly attended Hanoi Amsterdam and Stanford University').",
    "- Set confidence based on how clear the snippet makes their attendance at the universities.",
    "",
    "Return ONLY valid JSON that matches the provided JSON schema. No markdown, no extra keys."
  ].join("\n");
}

export async function findAlumniMatches(input: AlumniSearchInput): Promise<AlumniSearchResult> {
  const dreamUniversity = input.dreamUniversity?.trim();
  if (!dreamUniversity) {
    throw new Error("dreamUniversity is required.");
  }

  const limit = clamp(Math.floor(input.limit ?? 8), 1, MAX_LIMIT);
  const model = input.model ?? process.env.OPENAI_ALUMNI_MODEL ?? DEFAULT_MODEL;

  const openai = getOpenAIClient();
  const exaApiKey = process.env.EXA_API_KEY;
  if (!exaApiKey) {
    throw new Error("EXA_API_KEY environment variable is missing.");
  }
  
  // Initialize Exa
  const exa = new (Exa as any)(exaApiKey);

  // 1. Generate optimized queries
  console.log(`[Exa] Generating queries for: ${dreamUniversity}`);
  let queries = await generateSearchQueries(openai, input, model);
  
  // Fallback if LLM fails
  if (queries.length === 0) {
    const parts = [`site:linkedin.com/in`, `"${dreamUniversity}"`];
    if (input.user?.currentSchool) parts.push(`"${input.user.currentSchool}"`);
    else {
      if (input.user?.fieldOfStudy) parts.push(`"${input.user.fieldOfStudy}"`);
      if (input.user?.nationality) parts.push(`"${input.user.nationality}"`);
    }
    queries = [parts.join(" ")];
  }
  
  console.log(`[Exa] Executing ${queries.length} queries:`, queries);

  // 2. Execute searches in parallel
  let allSearchData: any[] = [];
  try {
    const searchPromises = queries.map(q => 
      exa.searchAndContents(q, {
        type: "auto",
        numResults: 5,
        text: { maxCharacters: 1000 }
      }).catch((e: Error) => {
        console.error(`[Exa] Query failed: ${q}`, e.message);
        return { results: [] };
      })
    );
    
    const resultsArray = await Promise.all(searchPromises);
    
    // Flatten and deduplicate by URL
    const seenUrls = new Set<string>();
    for (const searchResult of resultsArray) {
      for (const r of searchResult.results || []) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allSearchData.push({
            url: r.url,
            title: r.title,
            text: r.text
          });
        }
      }
    }
  } catch (error) {
    console.error("[Exa] Search batch failed:", error);
  }

  // 3. Extract and Rank via LLM
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildInstructions(limit) },
      { role: "user", content: JSON.stringify({ 
          dreamUniversity, 
          user: input.user ?? {}, 
          limit, 
          searchContext: allSearchData 
      })}
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "alumni_search_result",
        schema: ALUMNI_SEARCH_RESPONSE_SCHEMA,
        strict: true
      }
    }
  });

  const rawText = response.choices[0]?.message?.content ?? "";
  const parsed = JSON.parse(stripMarkdownFences(rawText)) as {
    dreamUniversity?: string;
    alumni?: Array<AlumniMatch & { 
      currentSchool?: string | null; 
      recentMatching?: string | null; 
      headline?: string | null; 
      location?: string | null; 
      graduation?: string | null 
    }>;
  };

  const alumni = Array.isArray(parsed.alumni) ? parsed.alumni : [];
  const normalized = dedupeByProfileUrl(alumni)
    .filter((item) => item && typeof item.profileUrl === "string" && isValidHttpUrl(item.profileUrl))
    .map((item) => ({
      ...item,
      currentSchool: item.currentSchool ?? undefined,
      recentMatching: item.recentMatching ?? undefined,
      headline: item.headline ?? undefined,
      location: item.location ?? undefined,
      graduation: item.graduation ?? undefined
    }))
    .slice(0, limit);

  return {
    dreamUniversity: parsed.dreamUniversity?.trim() || dreamUniversity,
    alumni: normalized
  };
}
