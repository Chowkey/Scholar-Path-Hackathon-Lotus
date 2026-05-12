/**
 * Apply the funding-normalized.json output produced by
 * scripts/backfillFundingNormalization.ts into the typed columns added by
 * migration 005_funding_normalized.sql:
 *
 *   - funding_kind
 *   - funding_amount_value
 *   - funding_amount_currency
 *   - funding_amount_period
 *
 * The raw `funding` text column is left untouched — it remains the display
 * string. We only write the structured fields.
 *
 * Dry-run by default (prints the proposed updates and exits). Pass --apply
 * to actually write to the database.
 *
 * Run:
 *   npx tsx scripts/applyFundingNormalization.ts             # dry-run, prints plan
 *   npx tsx scripts/applyFundingNormalization.ts --apply     # writes to DB
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import ws from "ws";

dotenv.config({ override: true });

const IN_FILE = path.join("scripts", "funding-normalized.json");
const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 50;

type FundingNormalized = {
  id: string;
  funding_raw: string;
  funding_kind:
    | "full_tuition_plus_stipend"
    | "full_tuition_only"
    | "partial"
    | "stipend_only"
    | "allowance"
    | "unspecified";
  amount_value: number | null;
  amount_currency: string | null;
  amount_period: "per_year" | "per_month" | "one_time" | "none";
  source: "embedding" | "llm";
  embedding_top_score: number;
  embedding_margin: number;
  rationale: string;
};

function ensureEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function loadClassifications(): FundingNormalized[] {
  if (!fs.existsSync(IN_FILE)) {
    throw new Error(
      `${IN_FILE} not found. Run scripts/backfillFundingNormalization.ts first.`,
    );
  }
  const parsed = JSON.parse(fs.readFileSync(IN_FILE, "utf8")) as {
    results?: FundingNormalized[];
  };
  const rows = parsed.results ?? [];
  if (rows.length === 0) {
    throw new Error(`${IN_FILE} contains no results.`);
  }
  return rows;
}

async function main() {
  const supabaseUrl = ensureEnv(
    "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL",
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const supabaseKey = ensureEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws as unknown as typeof WebSocket },
  });

  const rows = loadClassifications();
  console.log(`Loaded ${rows.length} classified rows from ${IN_FILE}.`);

  // Verify migration 005 is live by probing the new column on a single row.
  // Fails fast if the user forgot to apply it.
  const { error: probeError } = await db
    .from("scholarships")
    .select("funding_kind")
    .limit(1);
  if (probeError) {
    throw new Error(
      `scholarships.funding_kind not present — apply supabase/migrations/005_funding_normalized.sql first. (${probeError.message})`,
    );
  }

  // Cross-check ids against the current DB. Skip rows whose scholarship is
  // no longer present (the JSON file may include rows deleted since the
  // backfill ran).
  const { data: existing, error: idsError } = await db
    .from("scholarships")
    .select("id");
  if (idsError) throw idsError;
  const liveIds = new Set((existing ?? []).map((r) => r.id as string));
  const live = rows.filter((r) => liveIds.has(r.id));
  const stale = rows.length - live.length;
  if (stale > 0) {
    console.log(`Dropping ${stale} rows from the JSON that no longer exist in the DB.`);
  }

  // Histogram by funding_kind for sanity.
  const histogram = new Map<string, number>();
  for (const r of live) histogram.set(r.funding_kind, (histogram.get(r.funding_kind) ?? 0) + 1);
  console.log("Plan (rows to update):");
  for (const [kind, n] of [...histogram].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(28)} ${n}`);
  }

  if (!APPLY) {
    console.log(`\nDry-run only. Re-run with --apply to write ${live.length} rows.`);
    // Print the first three full updates so the user can eyeball shape.
    console.log("\nSample updates (first 3):");
    for (const r of live.slice(0, 3)) {
      console.log(`  ${r.id}: kind=${r.funding_kind}, amount=${r.amount_value}, currency=${r.amount_currency}, period=${r.amount_period}, src=${r.source}`);
    }
    return;
  }

  // Write in batches. Supabase's PostgREST has no native multi-row UPDATE,
  // so we do one update per row but parallelize within a batch.
  let done = 0;
  let failed = 0;
  for (let i = 0; i < live.length; i += BATCH_SIZE) {
    const batch = live.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((r) =>
        db
          .from("scholarships")
          .update({
            funding_kind: r.funding_kind,
            funding_amount_value: r.amount_value,
            funding_amount_currency: r.amount_currency,
            funding_amount_period: r.amount_period,
          })
          .eq("id", r.id),
      ),
    );
    for (let j = 0; j < results.length; j++) {
      const res = results[j];
      if (res.status === "rejected") {
        failed++;
        console.error(`  FAIL ${batch[j].id}: ${res.reason?.message ?? res.reason}`);
      } else if (res.value.error) {
        failed++;
        console.error(`  FAIL ${batch[j].id}: ${res.value.error.message}`);
      } else {
        done++;
      }
    }
    console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: ${done} ok, ${failed} failed (running total)`);
  }

  console.log(`\nDone. ${done} rows updated, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
