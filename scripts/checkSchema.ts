import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config({ override: true });

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE env");
    process.exit(1);
  }
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
        // Node <22 lacks native WebSocket. @supabase/realtime-js needs one even
        // for one-shot REST queries (it's wired up in the SupabaseClient ctor).
        // We never open a subscription, but the transport must be set for the
        // client to construct at all.
        realtime: { transport: ws as unknown as typeof WebSocket },
  });

  const checks: Array<{ name: string; ok: boolean; reason?: string }> = [];

  // 004 — normalized scholarship schema
  for (const table of [
    "countries",
    "organizations",
    "fields",
    "scholarships",
    "scholarship_fields",
  ]) {
    const { error } = await db.from(table).select("*").limit(1);
    checks.push({ name: `table public.${table}`, ok: !error, reason: error?.message });
  }

  // 003 — user data
  for (const table of [
    "profiles",
    "chat_sessions",
    "evaluations",
    "saved_scholarships",
    "user_scholarship_facts",
  ]) {
    const { error } = await db.from(table).select("*").limit(1);
    checks.push({ name: `table public.${table}`, ok: !error, reason: error?.message });
  }

  // Confirm scholarships has the new FK columns (proves migration 004 not just 001)
  const { error: schemaError } = await db
    .from("scholarships")
    .select("country_id, organization_id")
    .limit(1);
  checks.push({
    name: "scholarships.country_id + organization_id (migration 004)",
    ok: !schemaError,
    reason: schemaError?.message,
  });

  let failed = 0;
  for (const c of checks) {
    if (c.ok) {
      console.log(`OK  ${c.name}`);
    } else {
      failed += 1;
      console.log(`FAIL ${c.name} — ${c.reason}`);
    }
  }
  console.log("");
  if (failed > 0) {
    console.log(`${failed} check(s) failed — run migrations first.`);
    process.exit(1);
  } else {
    console.log("All schema checks passed.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
