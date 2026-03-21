/**
 * scripts/scholarshipDB.ts
 *
 * Two-step scholarship database builder:
 * 1. Use the OpenAI Responses API with web search to discover reliable scholarship pages.
 * 2. Use a scraper model (Interfaze by default, optionally OpenAI) to extract structured scholarship data.
 *
 * Required env:
 *   OPENAI_API_KEY=...
 *
 * Optional env:
 *   INTERFAZE_API_KEY=...
 *   OPENAI_DISCOVERY_MODEL=gpt-5.4
 *   OPENAI_SCRAPE_MODEL=gpt-5.4-mini
 *   INTERFAZE_MODEL=interfaze-beta
 *   SCHOLARSHIP_SOURCE_COUNT=5
 *   SCHOLARSHIP_SCRAPE_PROVIDER=interfaze
 *
 * Usage:
 *   npm run db:init
 */

import OpenAI from "openai";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ override: true });

interface ScholarshipRequirements {
  gpa?: string;
  ielts?: string;
  toefl?: string;
  essays: string[];
  other: string[];
}

interface Scholarship {
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
  requirements: ScholarshipRequirements;
  link: string;
}

interface DiscoveredSource {
  source_name: string;
  url: string;
  what_to_scrape: string[];
  reliability_explanation: string;
}

type ScrapeProvider = "interfaze" | "openai";

const SOURCE_COUNT = Number(process.env.SCHOLARSHIP_SOURCE_COUNT ?? "5");
const DISCOVERY_MODEL = process.env.OPENAI_DISCOVERY_MODEL ?? "gpt-5.4";
const OPENAI_SCRAPE_MODEL = process.env.OPENAI_SCRAPE_MODEL ?? "gpt-5.4-mini";
const INTERFAZE_MODEL = process.env.INTERFAZE_MODEL ?? "interfaze-beta";
const SCRAPE_PROVIDER = (process.env.SCHOLARSHIP_SCRAPE_PROVIDER ??
  "interfaze") as ScrapeProvider;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
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

function isValidDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  return !Number.isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function normalizeDegree(value: unknown): Scholarship["degree"] {
  const allowed = new Set(["undergraduate", "masters", "phd"]);
  const input = Array.isArray(value) ? value : [];
  const normalized = input.filter(
    (item): item is Scholarship["degree"][number] =>
      typeof item === "string" && allowed.has(item)
  );

  return normalized.length > 0 ? normalized : ["masters"];
}

function normalizeFunding(value: unknown): Scholarship["funding"] {
  return value === "full" ? "full" : "partial";
}

function normalizeStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : fallback;
}

function buildDiscoveryPrompt(minSources: number): string {
  return [
    "Find reliable, public scholarship or scholarship-program pages that are good candidates for future scraping.",
    `Return at least ${minSources} distinct sources.`,
    "",
    "Only include sources that are one of these:",
    "- official scholarship program pages",
    "- government education or scholarship portals",
    "- university scholarship directories",
    "- well-known scholarship search platforms with structured listings",
    "",
    "For each source include:",
    '- "source_name"',
    '- "url"',
    '- "what_to_scrape": an array of the specific page fields worth extracting',
    '- "reliability_explanation": why this source is credible and worth scraping',
    "",
    "Focus on pages that expose useful fields such as scholarship name, provider, deadline, award amount, eligibility, requirements, application link, country, degree level, and field of study.",
    "Prefer direct program pages over homepages when possible.",
    "Return only a JSON array. Do not wrap it in an object. Do not include markdown.",
  ].join("\n");
}

function buildScrapePrompt(source: DiscoveredSource): string {
  return [
    "You are extracting one scholarship or scholarship program into a normalized schema.",
    `Source name: ${source.source_name}`,
    `Source URL: ${source.url}`,
    `Target fields from discovery: ${source.what_to_scrape.join(", ")}`,
    `Why this source was selected: ${source.reliability_explanation}`,
    "",
    "Inspect the page content from the provided URL and return ONLY valid JSON with this exact structure:",
    "{",
    '  "id": "stable slug id",',
    '  "name": "official scholarship or program name",',
    '  "country": "country or region",',
    '  "flag": "flag emoji if known, otherwise empty string",',
    '  "organization": "awarding body",',
    '  "degree": ["undergraduate" | "masters" | "phd"],',
    '  "funding": "full" | "partial",',
    '  "fields": ["field of study", "..."],',
    '  "deadline": "YYYY-MM-DD",',
    '  "description": "2-3 sentence description",',
    '  "requirements": {',
    '    "gpa": "string or null",',
    '    "ielts": "string or null",',
    '    "toefl": "string or null",',
    '    "essays": ["..."],',
    '    "other": ["..."]',
    "  },",
    '  "link": "best application or learn-more URL"',
    "}",
    "",
    "Rules:",
    "- Use only facts you can support from the page content or clearly linked application details.",
    "- If the page is a directory page, extract the main scholarship or program represented by that page.",
    "- If an optional score is not specified, use null.",
    "- If a list is not specified, return an empty array.",
    "- deadline must be ISO format YYYY-MM-DD. If the page gives only a month or cycle, infer the best exact date only if explicitly supported; otherwise use the most recent exact deadline present on the page.",
    "- The JSON must be valid and contain no extra commentary.",
  ].join("\n");
}

async function discoverSources(openai: OpenAI): Promise<DiscoveredSource[]> {
  const response = await openai.responses.create({
    model: DISCOVERY_MODEL,
    input: [
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text: buildDiscoveryPrompt(SOURCE_COUNT),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Find strong scholarship pages for building a scholarship dataset.",
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
    throw new Error("Discovery API returned no text.");
  }

  let parsed: unknown;

  try {
    parsed = parseJson<unknown>(raw);
  } catch (error) {
    throw new Error(
      `Discovery response was not valid JSON. ${(error as Error).message}`
    );
  }

  const items = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { sources?: unknown }).sources)
      ? (parsed as { sources: unknown[] }).sources
      : [];

  const sources = items
    .map((item) => {
      const source = item as Partial<DiscoveredSource>;
      return {
        source_name: typeof source.source_name === "string" ? source.source_name.trim() : "",
        url: typeof source.url === "string" ? source.url.trim() : "",
        what_to_scrape: normalizeStringArray(source.what_to_scrape),
        reliability_explanation:
          typeof source.reliability_explanation === "string"
            ? source.reliability_explanation.trim()
            : "",
      };
    })
    .filter(
      (item) =>
        item.source_name &&
        /^https?:\/\//i.test(item.url) &&
        item.what_to_scrape.length > 0 &&
        item.reliability_explanation
    );

  if (sources.length === 0) {
    throw new Error("Discovery returned no usable sources.");
  }

  return sources.slice(0, SOURCE_COUNT);
}

function validateScholarship(
  scraped: Partial<Scholarship>,
  source: DiscoveredSource
): Scholarship | null {
  const id = typeof scraped.id === "string" && scraped.id.trim()
    ? slugify(scraped.id)
    : slugify(scraped.name || source.source_name);

  const name = typeof scraped.name === "string" ? scraped.name.trim() : "";
  const organization =
    typeof scraped.organization === "string" ? scraped.organization.trim() : "";
  const description =
    typeof scraped.description === "string" ? scraped.description.trim() : "";
  const deadline =
    typeof scraped.deadline === "string" && isValidDate(scraped.deadline)
      ? scraped.deadline
      : "";

  if (!id || !name || !organization || !description || !deadline) {
    return null;
  }

  const requirementsInput =
    typeof scraped.requirements === "object" && scraped.requirements !== null
      ? scraped.requirements
      : {};

  return {
    id,
    name,
    country:
      typeof scraped.country === "string" && scraped.country.trim()
        ? scraped.country.trim()
        : "Global",
    flag: typeof scraped.flag === "string" ? scraped.flag : "",
    organization,
    degree: normalizeDegree(scraped.degree),
    funding: normalizeFunding(scraped.funding),
    fields: normalizeStringArray(scraped.fields, ["Any"]),
    deadline,
    description,
    requirements: {
      gpa:
        typeof (requirementsInput as ScholarshipRequirements).gpa === "string"
          ? (requirementsInput as ScholarshipRequirements).gpa
          : undefined,
      ielts:
        typeof (requirementsInput as ScholarshipRequirements).ielts === "string"
          ? (requirementsInput as ScholarshipRequirements).ielts
          : undefined,
      toefl:
        typeof (requirementsInput as ScholarshipRequirements).toefl === "string"
          ? (requirementsInput as ScholarshipRequirements).toefl
          : undefined,
      essays: normalizeStringArray(
        (requirementsInput as ScholarshipRequirements).essays
      ),
      other: normalizeStringArray(
        (requirementsInput as ScholarshipRequirements).other
      ),
    },
    link:
      typeof scraped.link === "string" && /^https?:\/\//i.test(scraped.link)
        ? scraped.link
        : source.url,
  };
}

async function scrapeWithInterfaze(
  client: OpenAI,
  source: DiscoveredSource
): Promise<Partial<Scholarship>> {
  const response = await client.chat.completions.create({
    model: INTERFAZE_MODEL,
    messages: [
      {
        role: "user",
        content: buildScrapePrompt(source),
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

  return parseJson<Partial<Scholarship>>(raw);
}

async function scrapeWithOpenAI(
  client: OpenAI,
  source: DiscoveredSource
): Promise<Partial<Scholarship>> {
  const response = await client.responses.create({
    model: OPENAI_SCRAPE_MODEL,
    input: [
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text: buildScrapePrompt(source),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Inspect the scholarship page at ${source.url} and return the JSON object only.`,
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

  return parseJson<Partial<Scholarship>>(raw);
}

function toTypeScriptFile(scholarships: Scholarship[]): string {
  const lines: string[] = [
    "/**",
    " * lib/scholarships.ts",
    " * Auto-generated by scripts/scholarshipDB.ts",
    ` * Generated: ${new Date().toISOString()}`,
    " * Do not edit manually; re-run the build script to refresh.",
    " */",
    "",
    'import type { Scholarship } from "./types";',
    "",
    `export const scholarships: Scholarship[] = ${JSON.stringify(
      scholarships,
      null,
      2
    )};`,
    "",
    "export function getScholarshipById(id: string): Scholarship | undefined {",
    "  return scholarships.find((s) => s.id === id);",
    "}",
    "",
    "export function filterScholarships(opts: {",
    "  region?: string;",
    "  degree?: string;",
    '  funding?: "full" | "partial";',
    "  query?: string;",
    "}): Scholarship[] {",
    "  return scholarships.filter((s) => {",
    '    if (opts.region && opts.region !== "All" && s.country !== opts.region) return false;',
    '    if (opts.degree && opts.degree !== "All" && !s.degree.includes(opts.degree as Scholarship["degree"][0])) return false;',
    "    if (opts.funding && s.funding !== opts.funding) return false;",
    "    if (opts.query) {",
    "      const q = opts.query.toLowerCase();",
    "      if (!s.name.toLowerCase().includes(q) && !s.country.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false;",
    "    }",
    "    return true;",
    "  });",
    "}",
  ];

  return lines.join("\n");
}

async function main() {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  const interfazeApiKey = process.env.INTERFAZE_API_KEY;

  if (!openAiApiKey) {
    console.error("OPENAI_API_KEY is required for scholarship source discovery.");
    process.exit(1);
  }

  if (SCRAPE_PROVIDER === "interfaze" && !interfazeApiKey) {
    console.error(
      "INTERFAZE_API_KEY is required when SCHOLARSHIP_SCRAPE_PROVIDER=interfaze."
    );
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: openAiApiKey });
  const interfaze: OpenAI | null = interfazeApiKey
    ? new OpenAI({
        apiKey: interfazeApiKey,
        baseURL: "https://api.interfaze.ai/v1",
      })
    : null;

  console.log("ScholarPath scholarship builder");
  console.log(`Discovery model: ${DISCOVERY_MODEL}`);
  console.log(`Scrape provider: ${SCRAPE_PROVIDER}`);
  console.log(`Target source count: ${SOURCE_COUNT}`);
  console.log("");

  console.log("Step 1/2: discovering reliable source pages...");
  const sources = await discoverSources(openai);

  const sourceSnapshotPath = path.resolve(
    process.cwd(),
    "scripts",
    "discovered-sources.json"
  );
  fs.writeFileSync(sourceSnapshotPath, JSON.stringify(sources, null, 2), "utf-8");
  console.log(`Discovered ${sources.length} source pages.`);
  console.log(`Saved discovery snapshot to ${sourceSnapshotPath}`);
  console.log("");

  console.log("Step 2/2: scraping discovered pages into scholarship records...");

  const scholarships: Scholarship[] = [];
  const failed: Array<{ source: string; reason: string }> = [];

  for (const source of sources) {
    console.log(`Scraping ${source.source_name}`);

    try {
      const scraped =
        SCRAPE_PROVIDER === "openai"
          ? await scrapeWithOpenAI(openai, source)
          : await scrapeWithInterfaze(interfaze!, source);

      const normalized = validateScholarship(scraped, source);
      if (!normalized) {
        failed.push({
          source: source.source_name,
          reason: "Missing required fields after normalization.",
        });
        console.log("  skipped: invalid normalized scholarship object");
        continue;
      }

      scholarships.push(normalized);
      console.log(`  ok: ${normalized.name} (${normalized.deadline})`);
      await sleep(1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ source: source.source_name, reason: message });
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

  const outputPath = path.resolve(process.cwd(), "lib", "scholarships.ts");
  const snapshotPath = path.resolve(
    process.cwd(),
    "scripts",
    "scholarships-snapshot.json"
  );

  fs.writeFileSync(outputPath, toTypeScriptFile(uniqueScholarships), "utf-8");
  fs.writeFileSync(
    snapshotPath,
    JSON.stringify(uniqueScholarships, null, 2),
    "utf-8"
  );

  console.log("");
  console.log(`Wrote ${uniqueScholarships.length} scholarships to ${outputPath}`);
  console.log(`Saved JSON snapshot to ${snapshotPath}`);

  if (failed.length > 0) {
    console.log("");
    console.log("Some sources failed:");
    for (const item of failed) {
      console.log(`- ${item.source}: ${item.reason}`);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
