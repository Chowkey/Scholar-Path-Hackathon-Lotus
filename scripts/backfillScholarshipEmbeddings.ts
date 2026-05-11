/**
 * scripts/backfillScholarshipEmbeddings.ts
 *
 * Populates `scholarships.description_embedding` for every row where it's
 * still NULL. Idempotent and resumable: re-running only touches rows that
 * are still missing an embedding, so it's safe to kill (Ctrl-C) and rerun.
 *
 * Embeddings come from OpenAI — there is no pure-SQL way to do this without
 * `pg_net` + the Vault, which is brittle. This script is the supported path.
 *
 * Required env:
 *   OPENAI_API_KEY=...
 *   SUPABASE_URL=... (or NEXT_PUBLIC_SUPABASE_URL=...)
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Optional env:
 *   OPENAI_EMBEDDING_MODEL=text-embedding-3-small
 *   BACKFILL_PAGE_SIZE=200   # rows per Supabase fetch + OpenAI batch
 *
 * Usage:
 *   npx tsx scripts/backfillScholarshipEmbeddings.ts
 */

import dotenv from "dotenv";
import OpenAI from "openai";
import { createServiceClient } from "../lib/supabase/service";

dotenv.config({ override: true });

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const PAGE_SIZE = Math.max(1, Number(process.env.BACKFILL_PAGE_SIZE ?? "200"));

type Row = { id: string; description: string | null };

async function fetchPage(
  db: ReturnType<typeof createServiceClient>,
  limit: number,
): Promise<Row[]> {
  const { data, error } = await db
    .from("scholarships")
    .select("id, description")
    .is("description_embedding", null)
    .not("description", "is", null)
    .limit(limit);
  if (error) throw new Error(`fetch failed: ${error.message}`);
  return (data ?? []) as Row[];
}

async function embedBatch(client: OpenAI, inputs: string[]): Promise<Array<number[] | null>> {
  if (inputs.length === 0) return [];
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: inputs,
  });
  const data = (response as { data?: Array<{ embedding?: number[] }> }).data ?? [];
  return inputs.map((_, i) => {
    const vec = data[i]?.embedding;
    return Array.isArray(vec) && vec.length > 0 ? vec : null;
  });
}

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required.");
  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is required.");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  }

  const db = createServiceClient();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Count remaining so the progress logging means something.
  const { count, error: countError } = await db
    .from("scholarships")
    .select("id", { count: "exact", head: true })
    .is("description_embedding", null)
    .not("description", "is", null);
  if (countError) throw new Error(`count failed: ${countError.message}`);
  if (!count || count === 0) {
    console.log("Nothing to backfill — every scholarship already has an embedding.");
    return;
  }

  console.log(`Backfilling embeddings for ${count} scholarships (model=${EMBEDDING_MODEL}, page=${PAGE_SIZE}).`);

  let totalWritten = 0;
  let totalSkipped = 0;
  let pageIndex = 0;

  while (true) {
    const rows = await fetchPage(db, PAGE_SIZE);
    if (rows.length === 0) break;
    pageIndex += 1;

    const indices: number[] = [];
    const inputs: string[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const desc = (rows[i].description ?? "").trim();
      if (!desc) {
        totalSkipped += 1;
        continue;
      }
      indices.push(i);
      inputs.push(desc);
    }

    let embeddings: Array<number[] | null> = [];
    try {
      embeddings = await embedBatch(openai, inputs);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`  page ${pageIndex}: batch embed failed (${reason}). Skipping page.`);
      continue;
    }

    let pageWritten = 0;
    for (let k = 0; k < indices.length; k += 1) {
      const row = rows[indices[k]];
      const vec = embeddings[k];
      if (!vec) {
        totalSkipped += 1;
        continue;
      }
      const { error } = await db
        .from("scholarships")
        .update({ description_embedding: vec })
        .eq("id", row.id);
      if (error) {
        console.warn(`  row ${row.id}: update failed — ${error.message}`);
        totalSkipped += 1;
        continue;
      }
      pageWritten += 1;
    }

    totalWritten += pageWritten;
    console.log(`  page ${pageIndex}: wrote ${pageWritten}/${rows.length} (cumulative ${totalWritten}/${count})`);
  }

  console.log("");
  console.log(`Done. Wrote ${totalWritten} embeddings, skipped ${totalSkipped} (empty description or per-row failure).`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
