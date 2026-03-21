"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Link2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import type { Scholarship } from "@/lib/types";

type ScrapeResult = {
  importedCount: number;
  failedCount: number;
  scholarships: Scholarship[];
  failures: Array<{ source: string; reason: string }>;
};

function parseSources(input: string) {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ url: line }));
}

export default function AdminImportsPage() {
  const [linksInput, setLinksInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  const sourceCount = useMemo(() => parseSources(linksInput).length, [linksInput]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    const sources = parseSources(linksInput);
    if (sources.length === 0) {
      setError("Paste at least one scholarship source URL.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/scholarships/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources }),
      });

      const payload = (await response.json()) as ScrapeResult | { error?: string };
      if (!response.ok || !("importedCount" in payload)) {
        throw new Error(("error" in payload && payload.error) || "Unable to scrape and import sources.");
      }

      setResult(payload);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to scrape and import sources.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="px-8 py-10 md:px-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-stone-500">
          Admin Console
        </p>
        <div className="mt-3">
          <h1 className="font-heading text-4xl font-bold text-stone-900">Source Imports</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-stone-600">
            Paste scholarship listing or detail URLs and let ScholarPath scrape them into Supabase.
          </p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-stone-200 bg-white/95">
            <form onSubmit={handleSubmit}>
              <label className="block text-sm font-medium text-stone-700">Source links</label>
              <p className="mt-1 text-sm leading-6 text-stone-500">
                Enter one URL per line. These can be scholarship index pages or dedicated scholarship pages.
              </p>

              <textarea
                value={linksInput}
                onChange={(event) => setLinksInput(event.target.value)}
                rows={12}
                placeholder={"https://www.ox.ac.uk/...\nhttps://hannahed.co/..."}
                className="mt-4 w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500"
              />

              {error ? (
                <p className="mt-4 text-sm font-medium text-red-600">{error}</p>
              ) : null}

              <div className="mt-5 flex items-center justify-between gap-4">
                <p className="text-sm text-stone-500">
                  {sourceCount} source{sourceCount === 1 ? "" : "s"} ready
                </p>
                <Button type="submit" isLoading={isSubmitting}>
                  <UploadCloud className="h-4 w-4" />
                  Scrape and import
                </Button>
              </div>
            </form>
          </Card>

          <Card className="border-stone-200 bg-gradient-to-br from-white to-amber-50/60">
            <h2 className="font-heading text-xl font-semibold text-stone-900">How it works</h2>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
              <li>1. The admin submits source URLs.</li>
              <li>2. ScholarPath scrapes scholarship data from each source.</li>
              <li>3. Extracted records are normalized and upserted into Supabase.</li>
              <li>4. Failed sources are reported so you can retry or review them.</li>
            </ol>
          </Card>
        </div>

        {isSubmitting ? (
          <Card className="mt-6 border-stone-200 bg-white/95">
            <div className="flex items-center gap-3 text-stone-600">
              <Spinner className="h-5 w-5" />
              <div>
                <p className="font-medium text-stone-900">Scraping in progress</p>
                <p className="text-sm">
                  ScholarPath is extracting scholarship records from the submitted links.
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        {result ? (
          <div className="mt-8 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-emerald-200 bg-emerald-50/70">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Imported</p>
                    <p className="mt-1 text-3xl font-bold text-emerald-900">{result.importedCount}</p>
                  </div>
                </div>
              </Card>
              <Card className="border-amber-200 bg-amber-50/70">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Failed</p>
                    <p className="mt-1 text-3xl font-bold text-amber-900">{result.failedCount}</p>
                  </div>
                </div>
              </Card>
            </div>

            <Card className="border-stone-200 bg-white/95">
              <h2 className="font-heading text-xl font-semibold text-stone-900">Imported records</h2>
              {result.scholarships.length === 0 ? (
                <p className="mt-3 text-sm text-stone-500">No scholarships were accepted from these sources.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {result.scholarships.map((scholarship) => (
                    <div
                      key={scholarship.id}
                      className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3"
                    >
                      <p className="font-semibold text-stone-900">{scholarship.name}</p>
                      <p className="mt-1 text-sm text-stone-600">
                        {[scholarship.country, scholarship.degree, scholarship.organization].join(" | ")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {result.failures.length > 0 ? (
              <Card className="border-stone-200 bg-white/95">
                <h2 className="font-heading text-xl font-semibold text-stone-900">Failed sources</h2>
                <div className="mt-4 space-y-3">
                  {result.failures.map((failure) => (
                    <div
                      key={`${failure.source}-${failure.reason}`}
                      className="rounded-2xl border border-red-100 bg-red-50/60 px-4 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <Link2 className="mt-0.5 h-4 w-4 text-red-500" />
                        <div>
                          <p className="font-medium text-red-900">{failure.source}</p>
                          <p className="mt-1 text-sm text-red-700">{failure.reason}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
