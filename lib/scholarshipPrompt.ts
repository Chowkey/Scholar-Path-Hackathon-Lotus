import type { FundingAmountPeriod, FundingKind } from "@/lib/types";

export type SourceConfig = {
  name: string;
  url: string;
};

export type BuildScrapePromptOptions = {
  /** Cap on scholarships extracted from the source. */
  perSource: number;
  /**
   * Names of scholarships already in the DB whose source URL host matches the
   * one being scraped. The LLM is told to skip these. May be empty.
   */
  existingNames?: string[];
};

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

/**
 * Strict JSON schema both provider paths use (Interfaze / OpenAI structured
 * output). Kept in this module so the prompt text and the schema are
 * impossible to drift apart.
 */
export const SCRAPE_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scholarships"],
  properties: {
    scholarships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "country",
          "flag",
          "organization",
          "degree",
          "funding",
          "fundingKind",
          "fundingAmountValue",
          "fundingAmountCurrency",
          "fundingAmountPeriod",
          "field",
          "academicRequirements",
          "languageRequirements",
          "otherRequirements",
          "deadline",
          "description",
          "link",
          "sourceName",
          "sourceUrl",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          country: { type: "string" },
          flag: { type: "string" },
          organization: { type: "string" },
          degree: {
            type: "string",
            enum: [
              "Bachelor",
              "Master",
              "Doctorate",
              "Associate",
              "Diploma",
              "Certificate",
              "Foundation",
              "MBA",
              "Professional",
              "Postdoctoral",
              "Other",
            ],
          },
          funding: { type: "string" },
          fundingKind: { type: "string", enum: [...FUNDING_KINDS] },
          fundingAmountValue: { type: ["number", "null"] },
          fundingAmountCurrency: { type: ["string", "null"] },
          fundingAmountPeriod: { type: "string", enum: [...FUNDING_AMOUNT_PERIODS] },
          field: { type: "string" },
          academicRequirements: { type: "string" },
          languageRequirements: {
            type: "object",
            additionalProperties: false,
            required: ["ielts", "toefl", "pte", "duolingo", "other"],
            properties: {
              ielts: { type: ["string", "null"] },
              toefl: { type: ["string", "null"] },
              pte: { type: ["string", "null"] },
              duolingo: { type: ["string", "null"] },
              other: { type: "array", items: { type: "string" } },
            },
          },
          otherRequirements: { type: "string" },
          deadline: { type: "string" },
          description: { type: "string" },
          link: { type: "string" },
          sourceName: { type: "string" },
          sourceUrl: { type: "string" },
        },
      },
    },
  },
} as const;

/**
 * Build the scrape prompt. The single source of truth — both the admin endpoint
 * (lib/scholarshipScraper.ts) and the seed script (scripts/scholarshipDB.ts)
 * use this. Do NOT inline the prompt anywhere else.
 *
 * The exclusion block is only emitted when existingNames is non-empty. Names
 * should already be scoped to the source's host so the list stays short.
 */
export function buildScrapePrompt(source: SourceConfig, opts: BuildScrapePromptOptions): string {
  const { perSource, existingNames = [] } = opts;

  const exclusionBlock = existingNames.length > 0
    ? [
        "",
        "CRITICAL EXCLUSION: the following scholarships from this source are already in our database. Do NOT extract any of them — find DIFFERENT scholarships on the page:",
        ...existingNames.map((n) => `  - ${n}`),
        "",
      ]
    : [];

  return [
    "You are extracting scholarship records from a specific source page.",
    `Source name: ${source.name}`,
    `Source URL: ${source.url}`,
    `Extract up to ${perSource} DISTINCT scholarships from this source.`,
    "Prefer a RANDOM and DIVERSE subset rather than the first ones listed. Scroll deep into the content to find hidden or lesser-known scholarships.",
    ...exclusionBlock,
    "Field-by-field guidance:",
    '- "id": stable slug, e.g. oxford-rhodes-2025 — used only for in-run dedup; the database assigns its own UUID.',
    '- "name": scholarship name.',
    '- "country": country where the student will study.',
    '- "flag": flag emoji if known, else empty string.',
    '- "organization": university/college where the student will study.',
    '- "degree": exactly one of Bachelor, Master, Doctorate, Associate, Diploma, Certificate, Foundation, MBA, Professional, Postdoctoral, Other.',
    '- "funding": raw funding text or value from source (can be string or amount). Verbatim phrase suitable for display, e.g. "Covers full tuition fee; monthly stipend of SG 3,000; thesis allowance."',
    "",
    "FUNDING NORMALIZATION — also produce these four structured fields by reading the funding text on the source page:",
    '- "fundingKind": EXACTLY ONE of:',
    '    "full_tuition_plus_stipend"  — full tuition AND a living stipend/allowance.',
    '    "full_tuition_only"          — 100% tuition coverage, no living support mentioned.',
    '    "partial"                    — covers a percentage of tuition that is less than 100%.',
    '    "stipend_only"               — periodic living-support amount, no tuition coverage.',
    '    "allowance"                  — single-purpose grant (travel, conference, books, research).',
    '    "unspecified"                — no concrete funding details on the page.',
    '- "fundingAmountValue": the SINGLE most representative number (number, not string). Prefer the per-year living-cost figure when multiple are listed. If the page has no number, use null.',
    '- "fundingAmountCurrency": ISO 4217 code if known (USD, GBP, VND, EUR, AUD, SGD, etc.) or null if no currency stated.',
    '- "fundingAmountPeriod": EXACTLY ONE of "per_year", "per_month", "one_time", "none". Use "none" when fundingAmountValue is null.',
    "Handle multilingual funding text (English / Vietnamese / Chinese / Spanish / etc.) — read the meaning, then assign the category.",
    "",
    '- "field": single field of study label, e.g. Medicine, Law, Computer Science.',
    "",
    'CRITICAL — requirements fields. Copy text VERBATIM from the source. Do NOT summarize, paraphrase, condense, or rewrite. Preserve the source\'s original sentences, bullets, and ordering. Only minor whitespace/markdown cleanup is allowed.',
    "",
    '- "academicRequirements": verbatim raw text describing ONLY academic eligibility. Include items like: GPA / grade cutoffs, prior-degree requirements (e.g. completed bachelor\'s), required subjects or majors, class rank, thesis or research-topic constraints, academic achievements/awards, and required prior coursework.',
    "  DO NOT include any of the following in academicRequirements — these are NOT academic and belong in otherRequirements: nationality, citizenship, residency, country of origin, age, gender, marital/family status, financial need, intended career or post-study work obligation, employer/affiliation, gap-year limits, application format, character or personal-quality criteria, delivery mode, study mode (full/part-time), intake year.",
    "  If the source page lists a single \"Entry requirements\" block that mixes academic and non-academic items, SPLIT it: copy the academic lines verbatim here, and copy the non-academic lines verbatim into otherRequirements. Do NOT drop the non-academic lines.",
    "",
    '- "languageRequirements": structured object. Put each test\'s required score string under its key (ielts/toefl/pte/duolingo) verbatim from the source, or null if not stated. Put any other language conditions (e.g. "native English speaker", "language of instruction is German", "C1 certificate accepted") verbatim into the "other" array.',
    "",
    '- "otherRequirements": verbatim raw text for EVERY constraint that is NOT academic and NOT a language requirement. Do NOT summarize. Include (non-exhaustive): nationality, citizenship, residency, age, gender, marital/family status, financial need, intended career, post-study return/work obligations, employer or institutional affiliation, gap-year limits, application format/instructions, required documents, character/personal-quality criteria, delivery and study mode, intake/cohort year, and anything else the source lists that is not strictly academic and not a language test. If the source has nothing non-academic and non-language to say, set this to the empty string.',
    "",
    '- "deadline": YYYY-MM-DD if explicit, otherwise a short deadline note like Rolling or See source.',
    '- "description": 2-4 sentence summary (this field MAY be summarized — it is the only one).',
    '- "link": best application or detail URL.',
    '- "sourceName": source page name.',
    '- "sourceUrl": source page URL.',
    "",
    "Rules:",
    "- Use only information from the source page and clearly linked details.",
    "- Prioritize scholarships that clearly show study location and host institution.",
    "- The link field must be the scholarship detail/apply page URL for that specific scholarship.",
    "- Do not reuse the source URL as link unless the source page itself is a single scholarship detail page.",
    "- Do not invent values; when uncertain, use concise fallback text.",
    "- Return JSON conforming exactly to the provided schema.",
  ].join("\n");
}
