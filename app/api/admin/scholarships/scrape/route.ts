import { NextRequest, NextResponse } from "next/server";
import { scrapeScholarshipSources, upsertScholarshipsToSupabase, type SourceConfig } from "@/lib/scholarshipScraper";

type ScrapeRequestBody = {
  sources: Array<{ name?: string; url: string }>;
};

function getSourceName(url: string, index: number): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") || `Source ${index + 1}`;
  } catch {
    return `Source ${index + 1}`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ScrapeRequestBody;
    const rawSources = Array.isArray(body.sources) ? body.sources : [];

    const sources: SourceConfig[] = rawSources
      .map((item, index) => ({
        name: item.name?.trim() || getSourceName(item.url, index),
        url: item.url.trim(),
      }))
      .filter((item) => item.url.length > 0);

    if (sources.length === 0) {
      return NextResponse.json({ error: "Provide at least one source URL." }, { status: 400 });
    }

    const result = await scrapeScholarshipSources(sources);
    await upsertScholarshipsToSupabase(result.accepted);

    return NextResponse.json({
      importedCount: result.accepted.length,
      failedCount: result.failed.length,
      scholarships: result.accepted,
      failures: result.failed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to scrape sources.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
