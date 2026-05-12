import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase";
import { upsertScholarshipNormalized } from "@/lib/scholarshipNormalizedWriter";
import { normalizeCountry, normalizeDegreeLevel } from "@/lib/scholarshipOptions";
import {
  buildScrapePrompt,
  SCRAPE_RESPONSE_SCHEMA,
  type SourceConfig as PromptSourceConfig,
} from "@/lib/scholarshipPrompt";
import type {
  FundingAmountPeriod,
  FundingKind,
  LanguageRequirements,
  Scholarship,
} from "@/lib/types";

type ScrapeProvider = "interfaze" | "openai" | "auto";

export type SourceConfig = PromptSourceConfig;

type ScrapeSummary = {
  accepted: Scholarship[];
  failed: Array<{ source: string; reason: string }>;
};

const SCHOLARSHIPS_PER_SOURCE = Number(process.env.SCHOLARSHIPS_PER_SOURCE ?? "3");
const OPENAI_SCRAPE_MODEL = process.env.OPENAI_SCRAPE_MODEL ?? "gpt-5.4-mini";
const INTERFAZE_MODEL = process.env.INTERFAZE_MODEL ?? "interfaze-beta";
const SCRAPE_PROVIDER = (process.env.SCHOLARSHIP_SCRAPE_PROVIDER ?? "auto") as ScrapeProvider;
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

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

/** Host of a URL, lowercased, www. stripped. Falls back to the raw string. */
function urlHost(value: string): string {
  try {
    return new URL(value.trim()).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
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

const FUNDING_KINDS: readonly FundingKind[] = [
  "full_tuition_plus_stipend",
  "full_tuition_only",
  "partial",
  "stipend_only",
  "allowance",
  "unspecified",
] as const;

const FUNDING_AMOUNT_PERIODS: readonly FundingAmountPeriod[] = [
  "per_year",
  "per_month",
  "one_time",
  "none",
] as const;

function normalizeFundingKind(value: unknown): FundingKind {
  if (typeof value !== "string") return "unspecified";
  const lower = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (FUNDING_KINDS as readonly string[]).includes(lower) ? (lower as FundingKind) : "unspecified";
}

function normalizeFundingAmountPeriod(value: unknown): FundingAmountPeriod {
  if (typeof value !== "string") return "none";
  const lower = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (FUNDING_AMOUNT_PERIODS as readonly string[]).includes(lower) ? (lower as FundingAmountPeriod) : "none";
}

function normalizeFundingAmountValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[,_\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeFundingAmountCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  // ISO 4217 is 3 uppercase letters. Be lenient: accept anything 3-4 chars
  // for non-ISO codes the LLM may surface (e.g. CNY vs RMB). Reject empty.
  return /^[A-Z]{3,4}$/.test(trimmed) ? trimmed : null;
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

  const isVague = (val: unknown) => {
    const s = normalizeString(val).toLowerCase();
    return s.includes("see source") || s === "not specified" || s === "not specified." || s === "unknown" || s === "general" || s === "";
  };

  const vagueCount = [
    scraped.country,
    scraped.funding,
    scraped.field,
    scraped.academicRequirements,
    scraped.description,
  ].filter(isVague).length;

  if (vagueCount >= 3) {
    return { record: null, reason: "too many vague or 'See source' fields (likely a trash link or missing data)" };
  }

  // Local-only slug used for in-run dedup. The DB assigns the real UUID.
  const id = slugify(normalizeString(scraped.id, `${name}-${organization}-${index + 1}`));
  if (!id) return { record: null, reason: "invalid id" };

  // If the LLM gave us an amount but said the period is "none", trust the
  // amount and reset the period to a safer default. Conversely if no amount
  // was extracted, force period to "none" regardless of what the LLM said.
  const fundingAmountValue = normalizeFundingAmountValue(scraped.fundingAmountValue);
  let fundingAmountPeriod = normalizeFundingAmountPeriod(scraped.fundingAmountPeriod);
  if (fundingAmountValue === null) fundingAmountPeriod = "none";

  return {
    record: {
      id,
      name,
      country: normalizeCountry(normalizeString(scraped.country, "Unknown")),
      flag: normalizeString(scraped.flag),
      organization,
      degree: normalizeDegreeLevel(scraped.degree ?? "Other"),
      funding: normalizeString(scraped.funding, "Not specified"),
      fundingKind: normalizeFundingKind(scraped.fundingKind),
      fundingAmountValue,
      fundingAmountCurrency: normalizeFundingAmountCurrency(scraped.fundingAmountCurrency),
      fundingAmountPeriod,
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

/**
 * Live exclusion list: scholarships already in the DB whose source URL has the
 * same hostname as the one we're about to scrape. Keeps the prompt budget
 * tight (typically <50 names) while still catching every realistic collision.
 *
 * Returns an empty list on error so a flaky DB doesn't break scraping.
 */
async function loadExclusionNamesForSource(
  db: SupabaseClient,
  sourceUrl: string,
): Promise<string[]> {
  const host = urlHost(sourceUrl);
  if (!host) return [];
  try {
    const { data, error } = await db
      .from("scholarships")
      .select("name, source_url")
      .ilike("source_url", `%${host}%`)
      .limit(500);
    if (error) {
      console.warn(`[scraper] exclusion query failed for ${host}: ${error.message}`);
      return [];
    }
    const seen = new Set<string>();
    const names: string[] = [];
    for (const row of (data ?? []) as Array<{ name: string; source_url: string | null }>) {
      // Double-check host (ilike "%host%" can hit unrelated substrings).
      if (row.source_url && urlHost(row.source_url) !== host) continue;
      const trimmed = (row.name ?? "").trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      names.push(trimmed);
    }
    return names;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[scraper] exclusion query threw for ${host}: ${reason}`);
    return [];
  }
}

async function scrapeWithInterfaze(
  client: OpenAI,
  source: SourceConfig,
  existingNames: string[],
): Promise<Partial<Scholarship>[]> {
  // Interfaze auto-scrapes URLs that appear in the message content. See
  // https://interfaze.ai/docs/web/web-scraping. We pair that with strict
  // structured output (https://interfaze.ai/docs/structured-output) so the
  // model returns JSON conforming exactly to SCRAPE_RESPONSE_SCHEMA.
  const prompt = buildScrapePrompt(source, {
    perSource: SCHOLARSHIPS_PER_SOURCE,
    existingNames,
  });
  const response = await client.chat.completions.create({
    model: INTERFAZE_MODEL,
    messages: [
      {
        role: "user",
        content: `${prompt}\n\nExtract from this URL: ${source.url}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "scholarship_extraction",
        schema: SCRAPE_RESPONSE_SCHEMA,
        strict: true,
      },
    },
  } as never);

  const raw = getChatMessageText(response);
  if (!raw) throw new Error("Interfaze returned no content.");
  return normalizeScrapeArray(parseJson<unknown>(raw)).slice(0, SCHOLARSHIPS_PER_SOURCE);
}

async function scrapeWithOpenAI(
  client: OpenAI,
  source: SourceConfig,
  existingNames: string[],
): Promise<Partial<Scholarship>[]> {
  const prompt = buildScrapePrompt(source, {
    perSource: SCHOLARSHIPS_PER_SOURCE,
    existingNames,
  });
  const response = await client.responses.create({
    model: OPENAI_SCRAPE_MODEL,
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: prompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: `Extract scholarships from ${source.url} as requested and return JSON conforming to the provided schema.` }],
      },
    ],
    tools: [{ type: "web_search_preview" }],
    text: {
      format: {
        type: "json_schema",
        name: "scholarship_extraction",
        schema: SCRAPE_RESPONSE_SCHEMA,
        strict: true,
      },
    },
    reasoning: { effort: "medium", summary: "auto" },
  } as never);

  const raw = getResponsesText(response);
  if (!raw) throw new Error("OpenAI scrape returned no content.");
  return normalizeScrapeArray(parseJson<unknown>(raw)).slice(0, SCHOLARSHIPS_PER_SOURCE);
}

async function scrapeOneSource(
  source: SourceConfig,
  openai: OpenAI,
  interfaze: OpenAI | null,
  existingNames: string[],
): Promise<Partial<Scholarship>[]> {
  // Forced provider via env — useful for testing / debugging a single path.
  if (SCRAPE_PROVIDER === "openai") {
    return scrapeWithOpenAI(openai, source, existingNames);
  }
  if (SCRAPE_PROVIDER === "interfaze") {
    if (!interfaze) {
      throw new Error("INTERFAZE_API_KEY is required when SCHOLARSHIP_SCRAPE_PROVIDER=interfaze.");
    }
    return scrapeWithInterfaze(interfaze, source, existingNames);
  }

  // Default ("auto"): Interfaze primary, OpenAI fallback on error or empty result.
  if (interfaze) {
    try {
      const items = await scrapeWithInterfaze(interfaze, source, existingNames);
      if (items.length > 0) return items;
      console.warn(`[scraper] Interfaze returned 0 items for ${source.name}; falling back to OpenAI.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[scraper] Interfaze failed for ${source.name}: ${reason}. Falling back to OpenAI.`);
    }
  } else {
    console.warn("[scraper] INTERFAZE_API_KEY not set; using OpenAI directly.");
  }
  return scrapeWithOpenAI(openai, source, existingNames);
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

  // Single service-role client reused for every per-source exclusion query.
  const db = createServiceClient();

  const accepted: Scholarship[] = [];
  const failed: Array<{ source: string; reason: string }> = [];

  for (const source of sources) {
    try {
      const existingNames = await loadExclusionNamesForSource(db, source.url);
      const scrapedItems = await scrapeOneSource(source, openai, interfaze, existingNames);

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

/**
 * Batch-embed the description field of every scholarship in one OpenAI call.
 * Returns an array aligned 1:1 with `items` — entry is null when the
 * description was empty or the embedding response was malformed for that row.
 *
 * OpenAI's embeddings endpoint accepts up to 2048 inputs per request. We chunk
 * defensively at 512 to stay well within the per-request token cap.
 */
async function embedDescriptionsBatched(
  client: OpenAI,
  items: Scholarship[],
): Promise<Array<number[] | null>> {
  const out: Array<number[] | null> = new Array(items.length).fill(null);
  const CHUNK = 512;

  for (let start = 0; start < items.length; start += CHUNK) {
    const end = Math.min(items.length, start + CHUNK);
    const indices: number[] = [];
    const inputs: string[] = [];
    for (let i = start; i < end; i += 1) {
      const desc = (items[i].description ?? "").trim();
      if (!desc) continue;
      indices.push(i);
      inputs.push(desc);
    }
    if (inputs.length === 0) continue;

    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: inputs,
      });
      const data = (response as { data?: Array<{ embedding?: number[] }> }).data ?? [];
      for (let k = 0; k < indices.length; k += 1) {
        const vec = data[k]?.embedding;
        if (Array.isArray(vec) && vec.length > 0) {
          out[indices[k]] = vec;
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[scraper] embedding batch ${start}-${end} failed: ${reason}. Continuing without embeddings for these rows.`);
    }
  }

  return out;
}

function orgEmbeddingText(s: Scholarship): string {
  const org = (s.organization ?? "").trim();
  if (!org) return "";
  const country = (s.country ?? "").trim();
  if (!country || country.toLowerCase() === "unknown") return org;
  return `${org} in ${country}`;
}

function fieldEmbeddingText(s: Scholarship): string {
  const field = (s.field ?? "").trim();
  if (!field) return "";
  const lower = field.toLowerCase();
  if (lower === "general" || lower === "not specified") return "";
  return field;
}

/**
 * Embed a list of texts, deduplicating identical inputs so heavy repetition
 * (e.g. many scholarships sharing the same organization) costs only one API
 * call per unique text. Returns a Map from input text → embedding.
 */
async function embedTextsDeduped(
  client: OpenAI,
  texts: string[],
): Promise<Map<string, number[]>> {
  const unique = [...new Set(texts.map((t) => t.trim()).filter(Boolean))];
  const out = new Map<string, number[]>();
  if (unique.length === 0) return out;

  const CHUNK = 512;
  for (let start = 0; start < unique.length; start += CHUNK) {
    const batch = unique.slice(start, start + CHUNK);
    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      });
      const data = (response as { data?: Array<{ embedding?: number[] }> }).data ?? [];
      for (let k = 0; k < batch.length; k += 1) {
        const vec = data[k]?.embedding;
        if (Array.isArray(vec) && vec.length > 0) {
          out.set(batch[k], vec);
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[scraper] dedup-embed batch ${start}-${start + batch.length} failed: ${reason}.`);
    }
  }
  return out;
}

export async function upsertScholarshipsToSupabase(items: Scholarship[]): Promise<void> {
  if (items.length === 0) return;
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) throw new Error("OPENAI_API_KEY is required to embed scholarship descriptions.");

  const openai = new OpenAI({ apiKey: openAiApiKey });
  const db = createServiceClient();

  const orgTexts = items.map(orgEmbeddingText);
  const fieldTexts = items.map(fieldEmbeddingText);

  // Description: index-aligned (every row gets its own embedding).
  // Org and field: deduped (one embedding per unique text — huge savings
  // because many scholarships share the same org or field).
  const [descEmbeddings, orgMap, fieldMap] = await Promise.all([
    embedDescriptionsBatched(openai, items),
    embedTextsDeduped(openai, orgTexts),
    embedTextsDeduped(openai, fieldTexts),
  ]);

  for (let i = 0; i < items.length; i += 1) {
    await upsertScholarshipNormalized(db, items[i], {
      embedding: descEmbeddings[i] ?? undefined,
      orgEmbedding: orgTexts[i] ? orgMap.get(orgTexts[i]) : undefined,
      fieldEmbedding: fieldTexts[i] ? fieldMap.get(fieldTexts[i]) : undefined,
    });
  }
}
