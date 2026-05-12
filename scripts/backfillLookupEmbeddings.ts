/**
 * scripts/backfillLookupEmbeddings.ts
 *
 * Populates `organizations.embedding_org_country` and `fields.embedding_field`
 * for every row where they're still NULL. Idempotent and resumable.
 *
 * The embedding texts are:
 *   organizations: "{org_name} in {country_name}"   (country resolved by FK)
 *   fields:        "{field_name}"
 *
 * Required env:
 *   OPENAI_API_KEY=...
 *   SUPABASE_URL=... (or NEXT_PUBLIC_SUPABASE_URL=...)
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Optional env:
 *   OPENAI_EMBEDDING_MODEL=text-embedding-3-small
 *   BACKFILL_PAGE_SIZE=200
 *
 * Usage:
 *   npx tsx scripts/backfillLookupEmbeddings.ts                   # both tables
 *   npx tsx scripts/backfillLookupEmbeddings.ts --only=orgs       # organizations only
 *   npx tsx scripts/backfillLookupEmbeddings.ts --only=fields     # fields only
 */

import dotenv from "dotenv";
import OpenAI from "openai";
import { createServiceClient } from "../lib/supabase/service";

dotenv.config({ override: true });

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const PAGE_SIZE = Math.max(1, Number(process.env.BACKFILL_PAGE_SIZE ?? "200"));

const ONLY = (() => {
  const arg = process.argv.find((a) => a.startsWith("--only="));
  return arg ? arg.slice("--only=".length) : "all";
})();

function orgEmbeddingText(orgName: string, countryName: string | null | undefined): string {
  const country = (countryName ?? "").trim();
  if (!country) return orgName.trim();
  return `${orgName.trim()} in ${country}`;
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

type Db = ReturnType<typeof createServiceClient>;

async function backfillOrganizations(db: Db, openai: OpenAI) {
  const { count, error: countError } = await db
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .is("embedding_org_country", null);
  if (countError) throw new Error(`org count failed: ${countError.message}`);
  if (!count || count === 0) {
    console.log("organizations: nothing to backfill.");
    return;
  }
  console.log(`organizations: backfilling ${count} rows (model=${EMBEDDING_MODEL}, page=${PAGE_SIZE}).`);

  let totalWritten = 0;
  let totalSkipped = 0;
  let pageIndex = 0;

  while (true) {
    const { data: rows, error } = await db
      .from("organizations")
      .select("id, name, country:countries(name)")
      .is("embedding_org_country", null)
      .limit(PAGE_SIZE);
    if (error) throw new Error(`org fetch failed: ${error.message}`);
    if (!rows || rows.length === 0) break;
    pageIndex += 1;

    // PostgREST types nested selects as arrays by default; the FK here is
    // 1:1 so we cast through unknown to the narrower shape we actually use.
    const typed = rows as unknown as Array<{
      id: string;
      name: string;
      country: { name: string } | null;
    }>;

    const indices: number[] = [];
    const inputs: string[] = [];
    for (let i = 0; i < typed.length; i += 1) {
      const text = orgEmbeddingText(typed[i].name, typed[i].country?.name);
      if (!text) {
        totalSkipped += 1;
        continue;
      }
      indices.push(i);
      inputs.push(text);
    }

    let embeddings: Array<number[] | null> = [];
    try {
      embeddings = await embedBatch(openai, inputs);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`  org page ${pageIndex}: batch embed failed (${reason}). Skipping page.`);
      continue;
    }

    let pageWritten = 0;
    for (let k = 0; k < indices.length; k += 1) {
      const row = typed[indices[k]];
      const vec = embeddings[k];
      if (!vec) {
        totalSkipped += 1;
        continue;
      }
      const { error: updateError } = await db
        .from("organizations")
        .update({ embedding_org_country: vec })
        .eq("id", row.id);
      if (updateError) {
        console.warn(`  org ${row.id}: update failed — ${updateError.message}`);
        totalSkipped += 1;
        continue;
      }
      pageWritten += 1;
    }

    totalWritten += pageWritten;
    console.log(`  org page ${pageIndex}: wrote ${pageWritten}/${typed.length} (cumulative ${totalWritten}/${count})`);
  }

  console.log(`organizations done. wrote ${totalWritten}, skipped ${totalSkipped}.`);
}

async function backfillFields(db: Db, openai: OpenAI) {
  const { count, error: countError } = await db
    .from("fields")
    .select("id", { count: "exact", head: true })
    .is("embedding_field", null);
  if (countError) throw new Error(`field count failed: ${countError.message}`);
  if (!count || count === 0) {
    console.log("fields: nothing to backfill.");
    return;
  }
  console.log(`fields: backfilling ${count} rows.`);

  let totalWritten = 0;
  let totalSkipped = 0;
  let pageIndex = 0;

  while (true) {
    const { data: rows, error } = await db
      .from("fields")
      .select("id, name")
      .is("embedding_field", null)
      .limit(PAGE_SIZE);
    if (error) throw new Error(`field fetch failed: ${error.message}`);
    if (!rows || rows.length === 0) break;
    pageIndex += 1;

    const typed = rows as Array<{ id: string; name: string }>;
    const indices: number[] = [];
    const inputs: string[] = [];
    for (let i = 0; i < typed.length; i += 1) {
      const name = typed[i].name?.trim();
      if (!name) {
        totalSkipped += 1;
        continue;
      }
      indices.push(i);
      inputs.push(name);
    }

    let embeddings: Array<number[] | null> = [];
    try {
      embeddings = await embedBatch(openai, inputs);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`  field page ${pageIndex}: batch embed failed (${reason}). Skipping page.`);
      continue;
    }

    let pageWritten = 0;
    for (let k = 0; k < indices.length; k += 1) {
      const row = typed[indices[k]];
      const vec = embeddings[k];
      if (!vec) {
        totalSkipped += 1;
        continue;
      }
      const { error: updateError } = await db
        .from("fields")
        .update({ embedding_field: vec })
        .eq("id", row.id);
      if (updateError) {
        console.warn(`  field ${row.id}: update failed — ${updateError.message}`);
        totalSkipped += 1;
        continue;
      }
      pageWritten += 1;
    }

    totalWritten += pageWritten;
    console.log(`  field page ${pageIndex}: wrote ${pageWritten}/${typed.length} (cumulative ${totalWritten}/${count})`);
  }

  console.log(`fields done. wrote ${totalWritten}, skipped ${totalSkipped}.`);
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

  if (ONLY === "orgs" || ONLY === "all") await backfillOrganizations(db, openai);
  if (ONLY === "fields" || ONLY === "all") await backfillFields(db, openai);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
