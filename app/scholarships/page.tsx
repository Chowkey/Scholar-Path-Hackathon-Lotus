"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bookmark, SearchX } from "lucide-react";
import { ScholarshipCard } from "@/components/scholarships/ScholarshipCard";
import { SearchBar } from "@/components/scholarships/SearchBar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import {
  COUNTRY_OPTIONS,
  DEGREE_LEVEL_OPTIONS,
} from "@/lib/scholarshipOptions";
import { cn } from "@/lib/utils";
import type { Scholarship } from "@/lib/types";

const ALL = "All";

export default function ScholarshipsPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [country, setCountry] = useState(ALL);
  const [degree, setDegree] = useState(ALL);
  const [funding, setFunding] = useState("");
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [savedOnly, setSavedOnly] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string> | null>(null);
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    async function loadSavedIds() {
      try {
        const res = await fetch("/api/saved-scholarships", { cache: "no-store" });
        if (!active) return;
        if (res.status === 401) {
          setIsSignedIn(false);
          return;
        }
        if (!res.ok) {
          setIsSignedIn(true);
          setSavedIds(new Set());
          return;
        }
        const json = (await res.json()) as { ids: string[] };
        setIsSignedIn(true);
        setSavedIds(new Set(json.ids));
      } catch {
        if (active) setIsSignedIn(false);
      }
    }
    void loadSavedIds();

    function onSavedChanged(e: Event) {
      const detail = (e as CustomEvent<{ scholarshipId: string; saved: boolean }>).detail;
      if (!detail) return;
      setSavedIds((prev) => {
        const next = new Set(prev ?? []);
        if (detail.saved) next.add(detail.scholarshipId);
        else next.delete(detail.scholarshipId);
        return next;
      });
    }
    window.addEventListener("scholarpath:saved-changed", onSavedChanged);

    return () => {
      active = false;
      window.removeEventListener("scholarpath:saved-changed", onSavedChanged);
    };
  }, [reloadNonce]);

  const countryOptions = useMemo(() => [ALL, ...COUNTRY_OPTIONS], []);
  const degreeOptions = useMemo(() => [ALL, ...DEGREE_LEVEL_OPTIONS], []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadScholarships() {
      setIsLoading(true);
      setError(null);

      try {
        const searchParams = new URLSearchParams();
        if (country !== ALL) {
          searchParams.set("country", country);
        }
        if (degree !== ALL) {
          searchParams.set("degree", degree);
        }
        if (funding.trim()) {
          searchParams.set("funding", funding.trim());
        }
        if (debouncedQuery) {
          searchParams.set("query", debouncedQuery);
        }

        const endpoint = searchParams.toString()
          ? `/api/scholarships?${searchParams.toString()}`
          : "/api/scholarships";

        const response = await fetch(endpoint, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json()) as Scholarship[] | { error?: string };

        if (!response.ok || !Array.isArray(payload)) {
          const message =
            !Array.isArray(payload) && payload.error
              ? payload.error
              : "Unable to load scholarships right now.";
          throw new Error(message);
        }

        setScholarships(payload);
      } catch (caughtError) {
        if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
          return;
        }

        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load scholarships right now.";
        setError(message);
        setScholarships([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadScholarships();

    return () => controller.abort();
  }, [country, degree, funding, debouncedQuery, reloadNonce]);

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto max-w-7xl">
        <div>
          <h1 className="font-heading text-3xl font-bold text-neutral-900">
            Scholarship Directory
          </h1>
          <p className="mt-2 text-base leading-7 text-neutral-600">
            Filter by country, degree level, and field to find the right scholarship fit.
          </p>
        </div>

        <div className="sticky top-0 z-10 mt-6 space-y-5 rounded-2xl border-2 border-brand-100 bg-white/95 p-5 shadow-lg backdrop-blur">
          <SearchBar value={query} onChange={setQuery} />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-neutral-600">Country</span>
              <Select
                value={country}
                onChange={setCountry}
                options={countryOptions}
                searchable
                searchPlaceholder="Search country..."
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-neutral-600">Degree</span>
              <Select
                value={degree}
                onChange={setDegree}
                options={degreeOptions}
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-neutral-600">Funding Contains</span>
              <input
                value={funding}
                onChange={(event) => setFunding(event.target.value)}
                placeholder="e.g. 10000, full tuition"
                className="w-full rounded-xl border-2 border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 placeholder:text-neutral-400 shadow-sm outline-none transition-all hover:border-brand-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100/50"
              />
            </label>
          </div>

          {isSignedIn ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSavedOnly((v) => !v)}
                aria-pressed={savedOnly}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                  savedOnly
                    ? "border-brand-300 bg-brand-50 text-brand-700"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-brand-300 hover:text-brand-600",
                )}
              >
                <Bookmark className={cn("h-4 w-4", savedOnly && "fill-current")} />
                {savedOnly ? "Showing saved only" : "Saved only"}
                {savedIds ? (
                  <span className="rounded-full bg-white/70 px-2 text-xs text-neutral-500">
                    {savedIds.size}
                  </span>
                ) : null}
              </button>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="mt-8 flex items-center justify-center rounded-2xl border border-neutral-200 bg-white py-12 text-neutral-500 shadow-card">
            <Spinner className="mr-3 h-5 w-5" />
            <span>Loading scholarships...</span>
          </div>
        ) : error ? (
          <div className="mt-8 space-y-4">
            <EmptyState
              icon={AlertTriangle}
              title="We couldn't load scholarships"
              subtitle={error}
            />
            <div className="flex justify-center">
              <Button onClick={() => setReloadNonce((value) => value + 1)}>Try again</Button>
            </div>
          </div>
        ) : (() => {
          const visible = savedOnly && savedIds
            ? scholarships.filter((s) => savedIds.has(s.id))
            : scholarships;
          if (visible.length === 0) {
            return (
              <div className="mt-8">
                <EmptyState
                  icon={savedOnly ? Bookmark : SearchX}
                  title={
                    savedOnly
                      ? "No saved scholarships match those filters"
                      : "No scholarships match those filters"
                  }
                  subtitle={
                    savedOnly
                      ? "Bookmark scholarships from the directory to see them here, or turn off the Saved-only filter."
                      : "Try widening the country or degree filters, or search with a broader keyword."
                  }
                />
              </div>
            );
          }
          return (
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((scholarship) => (
                <ScholarshipCard key={scholarship.id} scholarship={scholarship} />
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
