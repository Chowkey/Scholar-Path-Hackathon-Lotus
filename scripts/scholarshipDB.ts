/**
 * scripts/scholarshipDB.ts
 *
 * Thin wrapper around lib/scholarshipScraper.ts so this CLI shares ONE
 * implementation with the admin endpoint:
 *
 *   1. Scrape every URL in FIXED_SOURCES via scrapeScholarshipSources().
 *      Exclusion of already-stored scholarships happens inside that function
 *      via a live Supabase query scoped to each source's host.
 *   2. Upsert results via upsertScholarshipsToSupabase(), which embeds
 *      descriptions in a single batched call and feeds them into the
 *      co-signal dedup RPC.
 *   3. Write a JSON snapshot of the just-scraped batch (useful for diffing,
 *      not used as a source of truth — Supabase is authoritative).
 *
 * Required env:
 *   OPENAI_API_KEY=...
 *   SUPABASE_URL=... (or NEXT_PUBLIC_SUPABASE_URL=...)
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Optional env:
 *   INTERFAZE_API_KEY=...
 *   OPENAI_SCRAPE_MODEL=gpt-5.4-mini
 *   OPENAI_EMBEDDING_MODEL=text-embedding-3-small
 *   INTERFAZE_MODEL=interfaze-beta
 *   SCHOLARSHIPS_PER_SOURCE=10
 *   SCHOLARSHIP_SCRAPE_PROVIDER=interfaze
 *
 * Usage:
 *   npm run db:seed
 */

import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
  scrapeScholarshipSources,
  upsertScholarshipsToSupabase,
  type SourceConfig,
} from "../lib/scholarshipScraper";

dotenv.config({ override: true });

const FIXED_SOURCES: SourceConfig[] = [
  { name: "HannahEd", url: "https://hannahed.co/" },
  {
    name: "Hotcourses Australia Agriculture Scholarships",
    url: "https://www.hotcoursesabroad.com/study/international-scholarships/australia/qn/agriculture-and-related-sciences/9/qid/a/scholarship.html",
  },
  {
    name: "Hotcourses Canada Computer and Mathematical Sciences Scholarships",
    url: "https://www.hotcoursesabroad.com/study/international-scholarships/canada/qn/computer-and-mathematical-sciences/32/qid/e/scholarship.html",
  },
  {
    name: "Hotcourses UK Architecture Scholarships",
    url: "https://www.hotcoursesabroad.com/study/international-scholarships/uk/qn/architecture-building-and-planning/210/qid/c/scholarship.html",
  },
  {
    name: "Hotcourses USA Law Scholarships",
    url: "https://www.hotcoursesabroad.com/study/international-scholarships/us-usa/qn/law/211/qid/j/scholarship.html",
  },
  {
    name: "Hotcourses Malaysia MBA Scholarships",
    url: "https://www.hotcoursesabroad.com/study/international-scholarships/malaysia/qn/mba/114/qid/k/scholarship.html",
  },
  {
    name: "Hotcourses Singapore Business Scholarships",
    url: "https://www.hotcoursesabroad.com/study/international-scholarships/singapore/qn/business-and-administrative-studies/168/qid/d/scholarship.html",
  },
  {
    name: "Oxford Scholarships A-Z",
    url: "https://www.ox.ac.uk/admissions/graduate/fees-and-funding/fees-funding-and-scholarship-search/scholarships-a-z-listing",
  },
];

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required for scholarship extraction.");
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is required for Supabase upsert.");
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is required for Supabase upsert.");
    process.exit(1);
  }

  console.log("ScholarPath scholarship builder");
  console.log(`Source count: ${FIXED_SOURCES.length}`);
  console.log("");

  const { accepted, failed } = await scrapeScholarshipSources(FIXED_SOURCES);

  for (const f of failed) {
    console.log(`  failed (${f.source}): ${f.reason}`);
  }

  console.log("");
  console.log(`Accepted ${accepted.length} scholarships from ${FIXED_SOURCES.length} sources.`);

  if (accepted.length === 0) {
    console.error("No scholarships were successfully scraped.");
    process.exit(1);
  }

  // Snapshot the just-scraped batch. Supabase is the authoritative store; this
  // file exists only as a debug artifact / for the db:upload-snapshot workflow.
  const snapshotPath = path.resolve(process.cwd(), "scripts", "scholarships-snapshot.json");
  fs.writeFileSync(snapshotPath, JSON.stringify(accepted, null, 2), "utf-8");
  console.log(`Wrote batch snapshot to ${snapshotPath}`);

  await upsertScholarshipsToSupabase(accepted);
  console.log(`Upserted ${accepted.length} scholarships into Supabase.`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
