/**
 * Two-pass funding-string normalization over the existing `scholarships` table.
 *
 *   Pass 1 — embedding nearest-neighbor classification (cheap).
 *   Pass 2 — gpt-4o-mini classifier for the ambiguous tail (strict JSON).
 *
 * Outputs to scripts/funding-normalized.json. Does NOT write to the database.
 *
 * Resume-safe / interruption-safe:
 *   - On every run, the script loads any existing results from the output
 *     file and SKIPS scholarship IDs already classified there. Re-running
 *     does not re-spend on Pass 2 calls already paid for.
 *   - During Pass 2, results are flushed to disk after every batch. If the
 *     script crashes or is Ctrl-C'd mid-Pass-2, the rows already processed
 *     are persisted and a re-run picks up from there.
 *
 * Flags:
 *   --pass1-only   Run Pass 0 + Pass 1 only. Persist the confidently-labeled
 *                  rows, count the ambiguous tail, then stop without making
 *                  any gpt-4o-mini calls. Eyeball the output, then re-run
 *                  without the flag to fill in Pass 2.
 *   --force        Ignore the cache. Re-classify every row from scratch.
 *
 * Run:
 *   npx tsx scripts/backfillFundingNormalization.ts                 # full run, resume from cache
 *   npx tsx scripts/backfillFundingNormalization.ts --pass1-only    # cheap preview
 *   npx tsx scripts/backfillFundingNormalization.ts --force         # ignore cache, re-classify all
 */

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import ws from "ws";

dotenv.config({ override: true });

// ─── Tunable knobs ─────────────────────────────────────────────────────────

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const LLM_MODEL = process.env.OPENAI_EVALUATE_MODEL ?? "gpt-4o-mini";
const EMBED_BATCH = 100;
const LLM_BATCH = 50;
const MIN_TOP_COSINE = 0.50;   // Top-1 must beat this to be accepted by Pass 1.
const MIN_MARGIN = 0.03;       // Top-1 must exceed top-2 by this much.
const OUT_FILE = path.join("scripts", "funding-normalized.json");

// ─── Funding-kind taxonomy + prototype phrases ─────────────────────────────

const FUNDING_KINDS = [
  "full_tuition_plus_stipend",
  "full_tuition_only",
  "partial",
  "stipend_only",
  "allowance",
  "unspecified",
] as const;
type FundingKind = (typeof FUNDING_KINDS)[number];

const FUNDING_PROTOTYPES: { kind: FundingKind; texts: string[] }[] = [
  {
    kind: "full_tuition_plus_stipend",
    texts: [
      "Full tuition coverage plus monthly living stipend and additional allowances for travel, visa, insurance, accommodation.",
      "Covers tuition fees in full and provides living expenses, conference allowance, thesis preparation grant, and other comprehensive support.",
      "Full ride scholarship. Fully funded program with tuition waiver and maintenance grant.",
      "Hỗ trợ tài chính đầy đủ, bao gồm học phí và sinh hoạt phí và chi phí đi lại.",
    ],
  },
  {
    kind: "full_tuition_only",
    texts: [
      "Covers 100% of tuition fees only. Full tuition fee waiver. No stipend or living allowance.",
      "Tuition-only scholarship. Pays the full course fee. Students cover living costs themselves.",
      "100% học phí. Miễn toàn bộ học phí, không bao gồm sinh hoạt phí.",
    ],
  },
  {
    kind: "partial",
    texts: [
      "Covers a percentage of tuition that is less than 100%. Partial scholarship.",
      "50% off tuition fees. Half-tuition scholarship. Partial fee waiver of $5,000 toward annual tuition.",
      "Học bổng bán phần. Hỗ trợ một phần học phí.",
    ],
  },
  {
    kind: "stipend_only",
    texts: [
      "A fixed monetary amount given periodically as living support without tuition coverage. £3,000 stipend per year.",
      "Monthly maintenance allowance for living expenses. Cash award. Annual living grant only.",
      "Trợ cấp sinh hoạt phí hàng tháng, không hỗ trợ học phí.",
    ],
  },
  {
    kind: "allowance",
    texts: [
      "A specific one-time or per-event monetary amount: travel allowance, conference allowance, research allowance, book allowance, IT allowance.",
      "Single grant for a defined purpose: thesis preparation grant, journal subscription stipend, dissertation award.",
    ],
  },
  {
    kind: "unspecified",
    texts: [
      "No funding details provided. See source. Contact institution. Details on award page. Not specified.",
      "Funding amount not stated. Refer to the official scholarship page for award value.",
    ],
  },
];

// ─── LLM classifier prompt + strict JSON schema ────────────────────────────

const LLM_PROMPT = [
  "You classify scholarship funding descriptions into one of six categories.",
  "For each item, return the kind, the headline numeric amount and currency",
  "(if any), the payment period (per_year / per_month / one_time / none), and",
  "a one-line rationale. Read the raw text carefully and handle multilingual",
  "input (English / Vietnamese / Chinese / Spanish / etc.).",
  "",
  "Categories:",
  '- "full_tuition_plus_stipend": full tuition AND a stipend/living allowance.',
  '- "full_tuition_only": 100% tuition, no living support.',
  '- "partial": less than 100% tuition coverage.',
  '- "stipend_only": living stipend without tuition coverage.',
  '- "allowance": single-purpose grant (travel, books, research, conference).',
  '- "unspecified": no concrete funding details ("See source", "Contact institution").',
  "",
  "For amount, pick the SINGLE most representative number (e.g. the annual",
  "stipend, or the total award if listed). If multiple distinct amounts are",
  "listed, prefer the per_year living-cost figure. Use null if no amount is",
  "stated. amount_currency must be an ISO 4217 code if known (USD, GBP, VND,",
  "EUR, AUD, SGD, etc.) or null. amount_period is one of per_year, per_month,",
  "one_time, none.",
  "",
  "Return JSON conforming exactly to the provided schema.",
].join("\n");

const LLM_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["classifications"],
  properties: {
    classifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "funding_kind", "amount_value", "amount_currency", "amount_period", "rationale"],
        properties: {
          id: { type: "string" },
          funding_kind: { type: "string", enum: [...FUNDING_KINDS] },
          amount_value: { type: ["number", "null"] },
          amount_currency: { type: ["string", "null"] },
          amount_period: { type: "string", enum: ["per_year", "per_month", "one_time", "none"] },
          rationale: { type: "string" },
        },
      },
    },
  },
} as const;

// ─── Result shape written to disk ──────────────────────────────────────────

type FundingNormalized = {
  id: string;
  funding_raw: string;
  funding_kind: FundingKind;
  amount_value: number | null;
  amount_currency: string | null;
  amount_period: "per_year" | "per_month" | "one_time" | "none";
  source: "embedding" | "llm";
  embedding_top_score: number;
  embedding_margin: number;
  rationale: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const PASS1_ONLY = process.argv.includes("--pass1-only");
const FORCE = process.argv.includes("--force");

function ensureEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function loadCache(filePath: string): Map<string, FundingNormalized> {
  if (!fs.existsSync(filePath)) return new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      results?: FundingNormalized[];
    };
    const map = new Map<string, FundingNormalized>();
    for (const r of parsed.results ?? []) {
      if (r && typeof r.id === "string") map.set(r.id, r);
    }
    return map;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cache] ${filePath} is unreadable (${msg}); starting fresh.`);
    return new Map();
  }
}

function saveResults(filePath: string, results: FundingNormalized[]) {
  // Write atomically: write to .tmp then rename, so a crash mid-write can't
  // leave a half-truncated JSON file on disk.
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(
    tmp,
    JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2),
  );
  fs.renameSync(tmp, filePath);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
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

// ─── Pass 1: embedding nearest-neighbor ────────────────────────────────────

async function embedAll(openai: OpenAI, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const batch of chunk(texts, EMBED_BATCH)) {
    const resp = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    for (const item of resp.data) out.push(item.embedding as number[]);
  }
  return out;
}

type PrototypeRow = { kind: FundingKind; embedding: number[] };

function classifyByEmbedding(
  fundingEmbedding: number[],
  prototypes: PrototypeRow[],
): { kind: FundingKind; topScore: number; margin: number } {
  // For each kind, take MAX cosine across that kind's prototypes.
  const scoresByKind = new Map<FundingKind, number>();
  for (const p of prototypes) {
    const sim = cosine(fundingEmbedding, p.embedding);
    const prev = scoresByKind.get(p.kind);
    if (prev === undefined || sim > prev) scoresByKind.set(p.kind, sim);
  }
  const ranked = [...scoresByKind.entries()].sort((a, b) => b[1] - a[1]);
  const [topKind, topScore] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;
  return { kind: topKind, topScore, margin: topScore - runnerUp };
}

// ─── Pass 2: LLM classifier for ambiguous rows ─────────────────────────────

type Ambiguous = {
  id: string;
  funding: string;
  embedding_top_score: number;
  embedding_margin: number;
};

async function classifyOneLLMBatch(
  openai: OpenAI,
  batch: Ambiguous[],
): Promise<FundingNormalized[]> {
  const payload = batch.map((r) => ({ id: r.id, funding: r.funding }));
  const response = await openai.responses.create({
    model: LLM_MODEL,
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: LLM_PROMPT }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify({ items: payload }) }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "funding_classification",
        schema: LLM_RESPONSE_SCHEMA,
        strict: true,
      },
    },
  } as never);

  const raw = getResponsesText(response);
  if (!raw) {
    console.warn(`[llm] empty response for batch starting at ${batch[0].id}`);
    return [];
  }
  const parsed = JSON.parse(raw) as {
    classifications: Array<{
      id: string;
      funding_kind: FundingKind;
      amount_value: number | null;
      amount_currency: string | null;
      amount_period: "per_year" | "per_month" | "one_time" | "none";
      rationale: string;
    }>;
  };

  const byId = new Map(batch.map((r) => [r.id, r]));
  const out: FundingNormalized[] = [];
  for (const c of parsed.classifications) {
    const meta = byId.get(c.id);
    if (!meta) continue;
    out.push({
      id: c.id,
      funding_raw: meta.funding,
      funding_kind: c.funding_kind,
      amount_value: c.amount_value,
      amount_currency: c.amount_currency,
      amount_period: c.amount_period,
      source: "llm",
      embedding_top_score: meta.embedding_top_score,
      embedding_margin: meta.embedding_margin,
      rationale: c.rationale,
    });
  }
  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const supabaseUrl = ensureEnv(
    "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL",
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const supabaseKey = ensureEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
  const openaiKey = ensureEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY);

  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Node <22 lacks native WebSocket. @supabase/realtime-js needs one even
    // for one-shot REST queries (it's wired up in the SupabaseClient ctor).
    // We never open a subscription, but the transport must be set for the
    // client to construct at all.
    realtime: { transport: ws as unknown as typeof WebSocket },
  });
  const openai = new OpenAI({ apiKey: openaiKey });

  // Load all scholarships' (id, funding).
  const { data: rows, error } = await db
    .from("scholarships")
    .select("id, funding")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load scholarships: ${error.message}`);
  if (!rows || rows.length === 0) {
    console.log("No scholarships in the database. Nothing to classify.");
    return;
  }
  console.log(`Loaded ${rows.length} scholarships from Supabase.`);

  // Load cached results (unless --force). Cache is keyed by scholarship id;
  // any id already labeled in the file is skipped on this run.
  const cache = FORCE ? new Map<string, FundingNormalized>() : loadCache(OUT_FILE);
  if (cache.size > 0) {
    console.log(`Loaded ${cache.size} cached results from ${OUT_FILE}. (Pass --force to ignore.)`);
  }

  // Threshold-aware cache invalidation: if MIN_TOP_COSINE / MIN_MARGIN has
  // moved since the file was written, any cached embedding-source row that
  // no longer meets the current bar gets dropped so Pass 1 / Pass 2 can
  // re-evaluate it. LLM-source rows are preserved either way — they were
  // already paid for, and the LLM verdict doesn't depend on these knobs.
  let invalidated = 0;
  for (const [id, row] of [...cache]) {
    if (row.source !== "embedding") continue;
    if (row.embedding_top_score < MIN_TOP_COSINE || row.embedding_margin < MIN_MARGIN) {
      cache.delete(id);
      invalidated++;
    }
  }
  if (invalidated > 0) {
    console.log(
      `Invalidated ${invalidated} cached embedding rows below the current ` +
      `threshold (top<${MIN_TOP_COSINE} or margin<${MIN_MARGIN}). They will be re-classified.`,
    );
  }

  // Pre-filter: rows whose funding is missing or trivially "unspecified" don't
  // need any API call — short-circuit them.
  const TRIVIAL_UNSPECIFIED = new Set([
    "", "not specified", "see source", "details on award page",
    "contact institution", "n/a", "tba", "tbd",
  ]);

  // Build the running result set, starting from the cache (filtered to ids
  // that still exist in the DB so stale rows don't accumulate forever).
  const currentIds = new Set((rows as Array<{ id: string }>).map((r) => r.id));
  const results: FundingNormalized[] = [];
  for (const [id, cached] of cache) {
    if (currentIds.has(id)) results.push(cached);
  }
  const alreadyDone = new Set(results.map((r) => r.id));
  console.log(`Carrying forward ${alreadyDone.size} cached labels.`);

  const toClassify: { id: string; funding: string }[] = [];
  let trivialCount = 0;
  for (const row of rows as Array<{ id: string; funding: string | null }>) {
    if (alreadyDone.has(row.id)) continue;

    const raw = (row.funding ?? "").trim();
    if (!raw || TRIVIAL_UNSPECIFIED.has(raw.toLowerCase())) {
      results.push({
        id: row.id,
        funding_raw: raw,
        funding_kind: "unspecified",
        amount_value: null,
        amount_currency: null,
        amount_period: "none",
        source: "embedding",
        embedding_top_score: 1,
        embedding_margin: 1,
        rationale: "Empty or trivially-unspecified funding string.",
      });
      trivialCount++;
      continue;
    }
    toClassify.push({ id: row.id, funding: raw });
  }
  console.log(`Short-circuited ${trivialCount} trivial rows. ${toClassify.length} to classify this run.`);

  // Persist the trivial labels immediately. If the run dies before Pass 1,
  // we still have them.
  saveResults(OUT_FILE, results);

  if (toClassify.length === 0) {
    console.log(`Nothing more to do. ${OUT_FILE} has ${results.length} rows.`);
    printHistogram(results);
    return;
  }

  // Pass 1 — embedding NN.
  const flatPrototypes = FUNDING_PROTOTYPES.flatMap((p) => p.texts.map((t) => ({ kind: p.kind, text: t })));
  console.log(`Embedding ${flatPrototypes.length} prototypes + ${toClassify.length} funding strings...`);
  const [protoEmbs, fundingEmbs] = await Promise.all([
    embedAll(openai, flatPrototypes.map((p) => p.text)),
    embedAll(openai, toClassify.map((r) => r.funding)),
  ]);
  const prototypes: PrototypeRow[] = flatPrototypes.map((p, i) => ({
    kind: p.kind,
    embedding: protoEmbs[i],
  }));

  const ambiguous: Ambiguous[] = [];
  let acceptedByEmbedding = 0;
  for (let i = 0; i < toClassify.length; i++) {
    const row = toClassify[i];
    const { kind, topScore, margin } = classifyByEmbedding(fundingEmbs[i], prototypes);
    const confident = topScore >= MIN_TOP_COSINE && margin >= MIN_MARGIN;
    if (confident) {
      results.push({
        id: row.id,
        funding_raw: row.funding,
        funding_kind: kind,
        amount_value: null,
        amount_currency: null,
        amount_period: "none",
        source: "embedding",
        embedding_top_score: topScore,
        embedding_margin: margin,
        rationale: `Pass 1: top1 ${kind} @ ${topScore.toFixed(3)} (margin ${margin.toFixed(3)})`,
      });
      acceptedByEmbedding++;
    } else {
      ambiguous.push({
        id: row.id,
        funding: row.funding,
        embedding_top_score: topScore,
        embedding_margin: margin,
      });
    }
  }
  console.log(`Pass 1 accepted ${acceptedByEmbedding} / ${toClassify.length}. ${ambiguous.length} ambiguous.`);

  // Persist Pass 1 labels before touching Pass 2 — this is the snapshot you
  // can eyeball without paying anything.
  saveResults(OUT_FILE, results);

  if (PASS1_ONLY) {
    console.log(`--pass1-only: stopping before Pass 2.`);
    console.log(`Wrote ${OUT_FILE} with ${results.length} rows.`);
    console.log(`${ambiguous.length} rows are still uncategorized and would be sent to ${LLM_MODEL}.`);
    console.log(`Re-run without --pass1-only to fill them in (already-classified rows will be skipped).`);
    printHistogram(results);
    return;
  }

  // Pass 2 — LLM classifier, flushing after each batch so progress survives
  // interruption. A re-run will load these from cache and not re-charge.
  if (ambiguous.length > 0) {
    const batches = chunk(ambiguous, LLM_BATCH);
    console.log(`Pass 2: routing ${ambiguous.length} rows to ${LLM_MODEL} in ${batches.length} batches of <=${LLM_BATCH}...`);
    let batchIdx = 0;
    for (const batch of batches) {
      batchIdx++;
      try {
        const out = await classifyOneLLMBatch(openai, batch);
        results.push(...out);
        saveResults(OUT_FILE, results);
        console.log(`  batch ${batchIdx}/${batches.length} → +${out.length} (total ${results.length}, persisted)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  batch ${batchIdx}/${batches.length} FAILED: ${msg}`);
        console.error(`  Already-completed batches are persisted in ${OUT_FILE}. Re-run to retry from here.`);
        throw err;
      }
    }
  }

  console.log(`Wrote ${OUT_FILE} with ${results.length} rows.`);
  printHistogram(results);
}

function printHistogram(results: FundingNormalized[]) {
  const histogram = new Map<FundingKind, number>();
  for (const r of results) histogram.set(r.funding_kind, (histogram.get(r.funding_kind) ?? 0) + 1);
  console.log("Distribution:");
  for (const kind of FUNDING_KINDS) {
    console.log(`  ${kind.padEnd(28)} ${histogram.get(kind) ?? 0}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
