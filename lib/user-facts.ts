import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Normalize a fact key to canonical snake_case so the AI cannot
 * accidentally store the same fact under multiple keys
 * (e.g. "GPA", "gpa", "Grade Point Average").
 */
export function canonicalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export type FactValue = string | number | boolean | string[] | null;

export type StoredFact = {
  user_id: string;
  key: string;
  value: FactValue;
  source: string | null;
  confidence: number | null;
  updated_at: string;
};

export type FactInput = {
  key: string;
  value: FactValue;
  source?: string;
  confidence?: number;
};

function valueIsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => item === b[i]);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function isEmptyValue(v: FactValue): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

/**
 * Upsert a batch of facts for a user.
 *
 * - Skips entries whose value is null/empty.
 * - Compares the new value to the stored one and only writes when changed
 *   (avoids needless updated_at churn so the index stays clean).
 *
 * Returns counts of inserted / updated / skipped rows for logging.
 */
export async function upsertFacts(
  supabase: SupabaseClient,
  userId: string,
  facts: FactInput[],
): Promise<{ inserted: number; updated: number; skipped: number }> {
  const cleaned = facts
    .map((f) => ({ ...f, key: canonicalizeKey(f.key) }))
    .filter((f) => f.key && !isEmptyValue(f.value));

  if (cleaned.length === 0) {
    return { inserted: 0, updated: 0, skipped: facts.length };
  }

  const keys = cleaned.map((f) => f.key);
  const { data: existing, error: selectError } = await supabase
    .from("user_scholarship_facts")
    .select("key, value")
    .eq("user_id", userId)
    .in("key", keys);
  if (selectError) throw selectError;

  const existingMap = new Map<string, unknown>();
  for (const row of existing ?? []) {
    existingMap.set((row as { key: string }).key, (row as { value: unknown }).value);
  }

  const toUpsert: Array<{
    user_id: string;
    key: string;
    value: FactValue;
    source: string | null;
    confidence: number | null;
    updated_at: string;
  }> = [];
  let skipped = 0;
  let updated = 0;
  let inserted = 0;

  const now = new Date().toISOString();
  for (const fact of cleaned) {
    if (existingMap.has(fact.key)) {
      const prev = existingMap.get(fact.key);
      if (valueIsEqual(prev, fact.value)) {
        skipped += 1;
        continue;
      }
      updated += 1;
    } else {
      inserted += 1;
    }
    toUpsert.push({
      user_id: userId,
      key: fact.key,
      value: fact.value,
      source: fact.source ?? null,
      confidence: fact.confidence ?? null,
      updated_at: now,
    });
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from("user_scholarship_facts")
      .upsert(toUpsert, { onConflict: "user_id,key" });
    if (error) throw error;
  }

  return { inserted, updated, skipped: skipped + (facts.length - cleaned.length) };
}

export async function listFacts(
  supabase: SupabaseClient,
  userId: string,
): Promise<StoredFact[]> {
  const { data, error } = await supabase
    .from("user_scholarship_facts")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StoredFact[];
}

export async function listFactsAsRecord(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, FactValue>> {
  const facts = await listFacts(supabase, userId);
  return Object.fromEntries(facts.map((f) => [f.key, f.value as FactValue]));
}
