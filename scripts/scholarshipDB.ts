/**
 * scripts/scholarshipDB.ts
 *
 * Scholarship seeding pipeline:
 * 1. Scrape a fixed list of scholarship source URLs.
 * 2. Extract up to N scholarships per source with LLM-based structuring.
 * 3. Upsert normalized records into Supabase.
 *
 * Required env:
 *   OPENAI_API_KEY=...
 *   SUPABASE_URL=... (or NEXT_PUBLIC_SUPABASE_URL=...)
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Optional env:
 *   INTERFAZE_API_KEY=...
 *   OPENAI_SCRAPE_MODEL=gpt-5.4-mini
 *   INTERFAZE_MODEL=interfaze-beta
 *   SCHOLARSHIPS_PER_SOURCE=3
 *   SCHOLARSHIP_SCRAPE_PROVIDER=interfaze
 *
 * Usage:
 *   npm run db:seed
 */

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { normalizeCountry, normalizeDegreeLevel } from "../lib/scholarshipOptions";
import type { LanguageRequirements, Scholarship } from "../lib/types";

dotenv.config({ override: true });

type ScrapeProvider = "interfaze" | "openai";

type SourceConfig = {
  name: string;
  url: string;
};

const FIXED_SOURCES: SourceConfig[] = [
  { name: "HannahEd", url: "https://hannahed.co/" },
  {
    name: "Hotcourses Australia Agriculture Scholarships",
    url: "https://www.hotcoursesabroad.com/study/international-scholarships/australia/qn/agriculture-and-related-sciences/9/qid/a/scholarship.html",
  },
  {
    name: "Hotcourses Canada Computer and Mathematical Sciences Scholarships",
    url: "https://www.hotcoursesabroad.com/study/international-scholarships/canada/qn/computer-and-mathematical-sciences/32/qid/e/scholarship.html",
  },
  {
    name: "Hotcourses UK Architecture Scholarships",
    url: "https://www.hotcoursesabroad.com/study/international-scholarships/uk/qn/architecture-building-and-planning/210/qid/c/scholarship.html",
  },
  {
    name: "Hotcourses USA Law Scholarships",
    url: "https://www.hotcoursesabroad.com/study/international-scholarships/us-usa/qn/law/211/qid/j/scholarship.html",
  },
  {
    name: "Hotcourses Malaysia MBA Scholarships",
    url: "https://www.hotcoursesabroad.com/study/international-scholarships/malaysia/qn/mba/114/qid/k/scholarship.html",
  },
  {
    name: "Hotcourses Singapore Business Scholarships",
    url: "https://www.hotcoursesabroad.com/study/international-scholarships/singapore/qn/business-and-administrative-studies/168/qid/d/scholarship.html",
  },
  {
    name: "Oxford Scholarships A-Z",
    url: "https://www.ox.ac.uk/admissions/graduate/fees-and-funding/fees-funding-and-scholarship-search/scholarships-a-z-listing",
  },
];

const SCHOLARSHIPS_PER_SOURCE = Number(process.env.SCHOLARSHIPS_PER_SOURCE ?? "10");
const OPENAI_SCRAPE_MODEL = process.env.OPENAI_SCRAPE_MODEL ?? "gpt-5.4-mini";
const INTERFAZE_MODEL = process.env.INTERFAZE_MODEL ?? "interfaze-beta";
const SCRAPE_PROVIDER = (process.env.SCHOLARSHIP_SCRAPE_PROVIDER ??
  "interfaze") as ScrapeProvider;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned) as T;
}

function getResponsesText(response: unknown): string {
  const candidate = response as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (typeof candidate.output_text === "string" && candidate.output_text.trim()) {
    return candidate.output_text;
  }

  const chunks =
    candidate.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text!.trim())
      .filter(Boolean) ?? [];

  return chunks.join("\n");
}

function getChatMessageText(response: unknown): string {
  const candidate = response as {
    choices?: Array<{
      message?: {
        content?:
        | string
        | Array<{
          type?: string;
          text?: string;
        }>;
      };
    }>;
  };

  const content = candidate.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((item) => typeof item.text === "string")
      .map((item) => item.text!.trim())
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeUrlForComparison(value: string): string {
  try {
    const parsed = new URL(value.trim());
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

function isSameUrl(a: string, b: string): boolean {
  return normalizeUrlForComparison(a) === normalizeUrlForComparison(b);
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

function normalizeLanguageRequirements(value: unknown): LanguageRequirements {
  if (!value || typeof value !== "object") {
    return { other: [] };
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

function normalizeScrapeArray(value: unknown): Partial<Scholarship>[] {
  if (Array.isArray(value)) {
    return value as Partial<Scholarship>[];
  }

  if (value && typeof value === "object") {
    const candidate = value as { scholarships?: unknown; results?: unknown };

    if (Array.isArray(candidate.scholarships)) {
      return candidate.scholarships as Partial<Scholarship>[];
    }

    if (Array.isArray(candidate.results)) {
      return candidate.results as Partial<Scholarship>[];
    }

    return [value as Partial<Scholarship>];
  }

  return [];
}

function buildScrapePrompt(source: SourceConfig, existingNames: string[] = []): string {
  const exclusionRule = existingNames.length > 0
    ? `- CRITICAL EXCLUSION: DO NOT extract any of the following known scholarships. They are already in the database: ${existingNames.join(", ")}`
    : "";

  return [
    "You are extracting scholarship records from a specific source page.",
    `Source name: ${source.name}`,
    `Source URL: ${source.url}`,
    `Extract up to ${SCHOLARSHIPS_PER_SOURCE} DISTINCT scholarships from this source.`,
    "",
    "Return ONLY valid JSON with this exact top-level structure:",
    "{",
    '  "scholarships": [',
    "    {",
    '      "id": "stable slug id",',
    '      "name": "scholarship name",',
    '      "country": "country where the student will study",',
    '      "flag": "flag emoji if known, else empty string",',
    '      "organization": "university/college where the student will study",',
    '      "degree": "one of Bachelor, Master, Doctorate, Associate, Diploma, Certificate, Foundation, MBA, Professional, Postdoctoral, Other",',
    '      "funding": "raw funding text or value from source (can be string or amount)",',
    '      "field": "single field of study label, e.g. Medicine, Law, Computer Science",',
    '      "academicRequirements": "detailed markdown text containing all academic requirements exactly as presented, preserving bullet points and lists",',
    '      "languageRequirements": {',
    '        "ielts": "string or null",',
    '        "toefl": "string or null",',
    '        "pte": "string or null",',
    '        "duolingo": "string or null",',
    '        "other": ["...optional language conditions..."]',
    "      },",
    '      "otherRequirements": "detailed markdown text containing all non-academic documents/requirements exactly as presented, preserving bullet points/formatting",',
    '      "deadline": "YYYY-MM-DD if explicit, otherwise a short deadline note like Rolling or See source",',
    '      "description": "detailed markdown summary covering what the scholarship offers, preserving original formatting",',
    '      "link": "best application or detail URL",',
    '      "sourceName": "source page name",',
    '      "sourceUrl": "source page URL"',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- CRITICAL FORMATTING: Do NOT summarize the requirements. Keep the original bullet points, lists, and full details using Markdown syntax.",
    "- CRITICAL: Please select a RANDOM and DIVERSE subset of scholarships from the page.",
    "- DO NOT just pick the first ones you encounter. Scroll deep into the content to find hidden or lesser-known scholarships.",
    exclusionRule,
    "- Use only information from the source page and clearly linked details.",
    "- Prioritize scholarships that clearly show study location and host institution.",
    "- If source has many listings, choose the most concrete and complete entries.",
    "- The link field must be the scholarship detail/apply page URL for that specific scholarship.",
    "- Do not reuse the source URL as link unless the source page itself is a single scholarship detail page.",
    "- Do not invent values; when uncertain, use concise fallback text.",
    "- Return JSON only, no markdown.",
  ].join("\n");
}

function validateScholarship(
  scraped: Partial<Scholarship>,
  source: SourceConfig,
  index: number
): { record: Scholarship | null; reason?: string } {
  const name = normalizeString(scraped.name);
  const organization = normalizeString(scraped.organization);
  const description = normalizeString(scraped.description);
  const link = normalizeString(scraped.link);

  if (!name) {
    return { record: null, reason: "missing name" };
  }
  if (!organization) {
    return { record: null, reason: "missing organization" };
  }
  if (!description) {
    return { record: null, reason: "missing description" };
  }
  if (!link) {
    return { record: null, reason: "missing link" };
  }
  if (isSameUrl(link, source.url)) {
    return {
      record: null,
      reason: "link points to source listing URL instead of scholarship detail/apply page",
    };
  }

  const isVague = (val: unknown) => {
    const s = normalizeString(val).toLowerCase();
    return s.includes("see source") || s === "not specified" || s === "not specified." || s === "unknown" || s === "general" || s === "";
  };

  const vagueCount = [
    scraped.country,
    scraped.funding,
    scraped.field,
    scraped.academicRequirements,
    scraped.description
  ].filter(isVague).length;

  if (vagueCount >= 3) {
    return { record: null, reason: "too many vague or 'See source' fields (likely a trash link or missing data)" };
  }

  const country = normalizeCountry(normalizeString(scraped.country, "Unknown"));
  const degree = normalizeDegreeLevel(scraped.degree ?? "Other");
  const funding = normalizeString(scraped.funding, "Not specified");
  const field = normalizeString(scraped.field, "General");
  const deadline = normalizeString(scraped.deadline, "See source");
  const academicRequirements = normalizeString(
    scraped.academicRequirements,
    "Not specified."
  );
  const otherRequirements = normalizeString(scraped.otherRequirements, "Not specified.");

  const idInput = normalizeString(scraped.id, `${name}-${organization}-${index + 1}`);
  const id = slugify(idInput);
  if (!id) {
    return { record: null, reason: "invalid id" };
  }

  return {
    record: {
      id,
      name,
      country,
      flag: normalizeString(scraped.flag),
      organization,
      degree,
      funding,
      field,
      academicRequirements,
      languageRequirements: normalizeLanguageRequirements(scraped.languageRequirements),
      otherRequirements,
      deadline,
      description,
      link,
      sourceName: normalizeString(scraped.sourceName, source.name),
      sourceUrl: normalizeString(scraped.sourceUrl, source.url),
    },
  };
}

async function scrapeWithInterfaze(
  client: OpenAI,
  source: SourceConfig,
  existingNames: string[]
): Promise<Partial<Scholarship>[]> {
  const response = await client.chat.completions.create({
    model: INTERFAZE_MODEL,
    temperature: 0.8,
    messages: [
      {
        role: "user",
        content: buildScrapePrompt(source, existingNames),
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "web_scrape",
          description: "Scrape a URL and return its content",
          parameters: {
            type: "object",
            properties: {
              url: { type: "string" },
            },
            required: ["url"],
          },
        },
      },
    ],
  });

  const raw = getChatMessageText(response);
  if (!raw) {
    throw new Error("Interfaze returned no content.");
  }

  const parsed = parseJson<unknown>(raw);
  return normalizeScrapeArray(parsed).slice(0, SCHOLARSHIPS_PER_SOURCE);
}

async function scrapeWithOpenAI(
  client: OpenAI,
  source: SourceConfig,
  existingNames: string[]
): Promise<Partial<Scholarship>[]> {
  const response = await client.responses.create({
    model: OPENAI_SCRAPE_MODEL,
    input: [
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text: buildScrapePrompt(source, existingNames),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Extract scholarships from ${source.url} as requested and return JSON only.`,
          },
        ],
      },
    ],
    tools: [{ type: "web_search_preview" }],
    reasoning: {
      effort: "medium",
      summary: "auto",
    },
  } as never);

  const raw = getResponsesText(response);
  if (!raw) {
    throw new Error("OpenAI scrape returned no content.");
  }

  const parsed = parseJson<unknown>(raw);
  return normalizeScrapeArray(parsed).slice(0, SCHOLARSHIPS_PER_SOURCE);
}

async function main() {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const interfazeApiKey = process.env.INTERFAZE_API_KEY;

  if (!openAiApiKey) {
    console.error("OPENAI_API_KEY is required for scholarship extraction.");
    process.exit(1);
  }

  if (SCRAPE_PROVIDER === "interfaze" && !interfazeApiKey) {
    console.error(
      "INTERFAZE_API_KEY is required when SCHOLARSHIP_SCRAPE_PROVIDER=interfaze."
    );
    process.exit(1);
  }

  if (!supabaseUrl) {
    console.error(
      "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is required for Supabase upsert."
    );
    process.exit(1);
  }

  if (!supabaseServiceRoleKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is required for Supabase upsert.");
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: openAiApiKey });
  const interfaze: OpenAI | null = interfazeApiKey
    ? new OpenAI({
      apiKey: interfazeApiKey,
      baseURL: "https://api.interfaze.ai/v1",
    })
    : null;

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("ScholarPath scholarship builder");
  console.log(`Scrape provider: ${SCRAPE_PROVIDER}`);
  console.log(`Scholarships per source: ${SCHOLARSHIPS_PER_SOURCE}`);
  console.log(`Source count: ${FIXED_SOURCES.length}`);
  console.log("");

  const sourceSnapshotPath = path.resolve(
    process.cwd(),
    "scripts",
    "discovered-sources.json"
  );
  fs.writeFileSync(sourceSnapshotPath, JSON.stringify(FIXED_SOURCES, null, 2), "utf-8");
  console.log(`Saved fixed source snapshot to ${sourceSnapshotPath}`);
  console.log("");

  const snapshotPath = path.resolve(
    process.cwd(),
    "scripts",
    "scholarships-snapshot.json"
  );

  let existingNames: string[] = [];
  let existingScholarships: Scholarship[] = [];
  try {
    if (fs.existsSync(snapshotPath)) {
      const rawSnapshot = fs.readFileSync(snapshotPath, "utf-8");
      existingScholarships = JSON.parse(rawSnapshot) as Scholarship[];
      existingNames = existingScholarships.map(s => s.name);
      console.log(`Loaded ${existingNames.length} existing scholarships to exclude from the new scrape.`);
    }
  } catch (e) {
    console.log("No existing snapshot found or error parsing snapshot, proceeding without exclusions.");
  }
  console.log("");

  const scholarships: Scholarship[] = [...existingScholarships];
  const failed: Array<{ source: string; reason: string }> = [];

  for (const source of FIXED_SOURCES) {
    console.log(`Scraping ${source.name}`);

    try {
      const scrapedItems =
        SCRAPE_PROVIDER === "openai"
          ? await scrapeWithOpenAI(openai, source, existingNames)
          : await scrapeWithInterfaze(interfaze!, source, existingNames);

      if (scrapedItems.length === 0) {
        failed.push({ source: source.name, reason: "no scholarships extracted" });
        console.log("  skipped: source returned no scholarships");
        continue;
      }

      let okCount = 0;
      for (const [index, raw] of scrapedItems.entries()) {
        const validation = validateScholarship(raw, source, index);
        if (!validation.record) {
          failed.push({
            source: source.name,
            reason: `entry ${index + 1}: ${validation.reason ?? "invalid object"}`,
          });
          continue;
        }

        scholarships.push(validation.record);
        okCount += 1;
      }

      console.log(`  ok: ${okCount}/${scrapedItems.length} scholarships accepted`);
      await sleep(800);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ source: source.name, reason: message });
      console.log(`  failed: ${message}`);
    }
  }

  if (scholarships.length === 0) {
    console.error("No scholarships were successfully scraped.");
    process.exit(1);
  }

  const uniqueScholarships = Array.from(
    new Map(scholarships.map((item) => [item.id, item])).values()
  );

  fs.writeFileSync(snapshotPath, JSON.stringify(uniqueScholarships, null, 2), "utf-8");

  const rows = uniqueScholarships.map((item) => ({
    id: item.id,
    name: item.name,
    country: item.country,
    flag: item.flag,
    organization: item.organization,
    degree: item.degree,
    funding: item.funding,
    field_of_study: item.field,
    academic_requirements: item.academicRequirements,
    language_requirements: item.languageRequirements,
    other_requirements: item.otherRequirements,
    deadline: item.deadline,
    description: item.description,
    link: item.link,
    source_name: item.sourceName ?? "",
    source_url: item.sourceUrl ?? "",
  }));

  const { error: upsertError } = await supabase
    .from("scholarships")
    .upsert(rows, { onConflict: "id" });

  if (upsertError) {
    throw new Error(`Supabase upsert failed: ${upsertError.message}`);
  }

  console.log("");
  console.log(`Wrote ${uniqueScholarships.length} scholarships to Supabase`);
  console.log(`Saved JSON snapshot to ${snapshotPath}`);

  if (failed.length > 0) {
    console.log("");
    console.log("Some extractions failed:");
    for (const item of failed) {
      console.log(`- ${item.source}: ${item.reason}`);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
