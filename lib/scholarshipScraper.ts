import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase";
import { upsertScholarshipNormalized } from "@/lib/scholarshipNormalizedWriter";
import { normalizeCountry, normalizeDegreeLevel } from "@/lib/scholarshipOptions";
import type { LanguageRequirements, Scholarship } from "@/lib/types";

type ScrapeProvider = "interfaze" | "openai";

export type SourceConfig = {
  name: string;
  url: string;
};

type ScrapeSummary = {
  accepted: Scholarship[];
  failed: Array<{ source: string; reason: string }>;
};

const SCHOLARSHIPS_PER_SOURCE = Number(process.env.SCHOLARSHIPS_PER_SOURCE ?? "3");
const OPENAI_SCRAPE_MODEL = process.env.OPENAI_SCRAPE_MODEL ?? "gpt-5.4-mini";
const INTERFAZE_MODEL = process.env.INTERFAZE_MODEL ?? "interfaze-beta";
const SCRAPE_PROVIDER = (process.env.SCHOLARSHIP_SCRAPE_PROVIDER ?? "interfaze") as ScrapeProvider;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

function getResponsesText(response: unknown): string {
  const candidate = response as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
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
        content?: string | Array<{ type?: string; text?: string }>;
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

  if (typeof candidate.ielts === "string" && candidate.ielts.trim()) output.ielts = candidate.ielts.trim();
  if (typeof candidate.toefl === "string" && candidate.toefl.trim()) output.toefl = candidate.toefl.trim();
  if (typeof candidate.pte === "string" && candidate.pte.trim()) output.pte = candidate.pte.trim();
  if (typeof candidate.duolingo === "string" && candidate.duolingo.trim()) output.duolingo = candidate.duolingo.trim();

  return output;
}

function normalizeScrapeArray(value: unknown): Partial<Scholarship>[] {
  if (Array.isArray(value)) {
    return value as Partial<Scholarship>[];
  }

  if (value && typeof value === "object") {
    const candidate = value as { scholarships?: unknown; results?: unknown };
    if (Array.isArray(candidate.scholarships)) return candidate.scholarships as Partial<Scholarship>[];
    if (Array.isArray(candidate.results)) return candidate.results as Partial<Scholarship>[];
    return [value as Partial<Scholarship>];
  }

  return [];
}

function buildScrapePrompt(source: SourceConfig): string {
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
    '      "id": "stable slug, e.g. oxford-rhodes-2025 — used only for in-run dedup; the database assigns its own UUID",',
    '      "name": "scholarship name",',
    '      "country": "country where the student will study",',
    '      "flag": "flag emoji if known, else empty string",',
    '      "organization": "university/college where the student will study",',
    '      "degree": "one of Bachelor, Master, Doctorate, Associate, Diploma, Certificate, Foundation, MBA, Professional, Postdoctoral, Other",',
    '      "funding": "raw funding text or value from source (can be string or amount)",',
    '      "field": "single field of study label, e.g. Medicine, Law, Computer Science",',
    '      "academicRequirements": "short paragraph summarizing academic requirements",',
    '      "languageRequirements": {',
    '        "ielts": "string or null",',
    '        "toefl": "string or null",',
    '        "pte": "string or null",',
    '        "duolingo": "string or null",',
    '        "other": ["...optional language conditions..."]',
    "      },",
    '      "otherRequirements": "short paragraph for non-academic and non-language constraints",',
    '      "deadline": "YYYY-MM-DD if explicit, otherwise a short deadline note like Rolling or See source",',
    '      "description": "2-4 sentence summary",',
    '      "link": "best application or detail URL",',
    '      "sourceName": "source page name",',
    '      "sourceUrl": "source page URL"',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- Use only information from the source page and clearly linked details.",
    "- Prioritize scholarships that clearly show study location and host institution.",
    "- The link field must be the scholarship detail/apply page URL for that specific scholarship.",
    "- Do not reuse the source URL as link unless the source page itself is a single scholarship detail page.",
    "- Do not invent values; when uncertain, use concise fallback text.",
    "- Return JSON only, no markdown.",
  ].join("\n");
}

function validateScholarship(scraped: Partial<Scholarship>, source: SourceConfig, index: number) {
  const name = normalizeString(scraped.name);
  const organization = normalizeString(scraped.organization);
  const description = normalizeString(scraped.description);
  const link = normalizeString(scraped.link);

  if (!name) return { record: null, reason: "missing name" };
  if (!organization) return { record: null, reason: "missing organization" };
  if (!description) return { record: null, reason: "missing description" };
  if (!link) return { record: null, reason: "missing link" };
  if (isSameUrl(link, source.url)) {
    return { record: null, reason: "link points to source listing URL instead of detail/apply page" };
  }

  // Local-only slug used for in-run dedup. The DB assigns the real UUID.
  const id = slugify(normalizeString(scraped.id, `${name}-${organization}-${index + 1}`));
  if (!id) return { record: null, reason: "invalid id" };

  return {
    record: {
      id,
      name,
      country: normalizeCountry(normalizeString(scraped.country, "Unknown")),
      flag: normalizeString(scraped.flag),
      organization,
      degree: normalizeDegreeLevel(scraped.degree ?? "Other"),
      funding: normalizeString(scraped.funding, "Not specified"),
      field: normalizeString(scraped.field, "General"),
      academicRequirements: normalizeString(scraped.academicRequirements, "Not specified."),
      languageRequirements: normalizeLanguageRequirements(scraped.languageRequirements),
      otherRequirements: normalizeString(scraped.otherRequirements, "Not specified."),
      deadline: normalizeString(scraped.deadline, "See source"),
      description,
      link,
      sourceName: normalizeString(scraped.sourceName, source.name),
      sourceUrl: normalizeString(scraped.sourceUrl, source.url),
    } satisfies Scholarship,
  };
}

async function scrapeWithInterfaze(client: OpenAI, source: SourceConfig): Promise<Partial<Scholarship>[]> {
  const response = await client.chat.completions.create({
    model: INTERFAZE_MODEL,
    messages: [{ role: "user", content: buildScrapePrompt(source) }],
    tools: [
      {
        type: "function",
        function: {
          name: "web_scrape",
          description: "Scrape a URL and return its content",
          parameters: {
            type: "object",
            properties: { url: { type: "string" } },
            required: ["url"],
          },
        },
      },
    ],
  });

  const raw = getChatMessageText(response);
  if (!raw) throw new Error("Interfaze returned no content.");
  return normalizeScrapeArray(parseJson<unknown>(raw)).slice(0, SCHOLARSHIPS_PER_SOURCE);
}

async function scrapeWithOpenAI(client: OpenAI, source: SourceConfig): Promise<Partial<Scholarship>[]> {
  const response = await client.responses.create({
    model: OPENAI_SCRAPE_MODEL,
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: buildScrapePrompt(source) }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: `Extract scholarships from ${source.url} as requested and return JSON only.` }],
      },
    ],
    tools: [{ type: "web_search_preview" }],
    reasoning: { effort: "medium", summary: "auto" },
  } as never);

  const raw = getResponsesText(response);
  if (!raw) throw new Error("OpenAI scrape returned no content.");
  return normalizeScrapeArray(parseJson<unknown>(raw)).slice(0, SCHOLARSHIPS_PER_SOURCE);
}

export async function scrapeScholarshipSources(sources: SourceConfig[]): Promise<ScrapeSummary> {
  if (sources.length === 0) {
    return { accepted: [], failed: [] };
  }

  const openAiApiKey = process.env.OPENAI_API_KEY;
  const interfazeApiKey = process.env.INTERFAZE_API_KEY;
  if (!openAiApiKey) throw new Error("OPENAI_API_KEY is required for scholarship extraction.");
  if (SCRAPE_PROVIDER === "interfaze" && !interfazeApiKey) {
    throw new Error("INTERFAZE_API_KEY is required when SCHOLARSHIP_SCRAPE_PROVIDER=interfaze.");
  }

  const openai = new OpenAI({ apiKey: openAiApiKey });
  const interfaze = interfazeApiKey
    ? new OpenAI({ apiKey: interfazeApiKey, baseURL: "https://api.interfaze.ai/v1" })
    : null;

  const accepted: Scholarship[] = [];
  const failed: Array<{ source: string; reason: string }> = [];

  for (const source of sources) {
    try {
      const scrapedItems =
        SCRAPE_PROVIDER === "openai"
          ? await scrapeWithOpenAI(openai, source)
          : await scrapeWithInterfaze(interfaze!, source);

      if (scrapedItems.length === 0) {
        failed.push({ source: source.name, reason: "no scholarships extracted" });
        continue;
      }

      for (const [index, raw] of scrapedItems.entries()) {
        const validation = validateScholarship(raw, source, index);
        if (!validation.record) {
          failed.push({ source: source.name, reason: `entry ${index + 1}: ${validation.reason ?? "invalid object"}` });
          continue;
        }

        accepted.push(validation.record);
      }
    } catch (error) {
      failed.push({
        source: source.name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    accepted: Array.from(new Map(accepted.map((item) => [item.id, item])).values()),
    failed,
  };
}

export async function upsertScholarshipsToSupabase(items: Scholarship[]): Promise<void> {
  if (items.length === 0) return;
  const db = createServiceClient();
  for (const item of items) {
    await upsertScholarshipNormalized(db, item);
  }
}
