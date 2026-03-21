import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import type { Scholarship } from "../lib/types";

dotenv.config({ override: true });

type SnapshotRow = {
  id: string;
  name: string;
  country: string;
  flag: string;
  organization: string;
  degree: string;
  funding: string;
  field: string;
  academicRequirements: string;
  languageRequirements: Scholarship["languageRequirements"];
  otherRequirements: string;
  deadline: string;
  description: string;
  link: string;
  sourceName?: string;
  sourceUrl?: string;
};

function ensureEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function main() {
  const supabaseUrl = ensureEnv(
    "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)",
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  const serviceRoleKey = ensureEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const snapshotPath = path.resolve(
    process.cwd(),
    "scripts",
    "scholarships-snapshot.json"
  );
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot file not found: ${snapshotPath}`);
  }

  const raw = fs.readFileSync(snapshotPath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Snapshot format is invalid. Expected a JSON array.");
  }

  const records = parsed as SnapshotRow[];
  if (records.length === 0) {
    throw new Error("Snapshot is empty.");
  }

  const rows = records.map((item) => ({
    id: item.id,
    name: item.name,
    country: item.country,
    flag: item.flag ?? "",
    organization: item.organization,
    degree: item.degree,
    funding: item.funding,
    field_of_study: item.field,
    academic_requirements: item.academicRequirements ?? "",
    language_requirements: item.languageRequirements ?? { other: [] },
    other_requirements: item.otherRequirements ?? "",
    deadline: item.deadline,
    description: item.description,
    link: item.link,
    source_name: item.sourceName ?? "",
    source_url: item.sourceUrl ?? "",
  }));

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase
    .from("scholarships")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  console.log(`Uploaded ${rows.length} scholarships from snapshot to Supabase.`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
