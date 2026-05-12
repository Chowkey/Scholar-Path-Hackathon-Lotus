"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ScholarshipCard } from "@/components/scholarships/ScholarshipCard";
import type { Scholarship } from "@/lib/types";

type SimilarItem = Scholarship & { similarity: number };

type ApiResponse = { items?: SimilarItem[]; error?: string };

type Props = {
  scholarshipId: string;
  limit?: number;
};

/**
 * "Show similar scholarships" toggle for the detail page. Lazy-loads from
 * /api/scholarships/[id]/similar on first open; results are cached so the
 * toggle is free after that.
 */
export function SimilarScholarships({ scholarshipId, limit = 10 }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SimilarItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (items !== null || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/scholarships/${scholarshipId}/similar?limit=${limit}`);
      const body = (await res.json()) as ApiResponse;
      if (!res.ok) throw new Error(body.error ?? "Failed to load similar scholarships.");
      setItems(body.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load similar scholarships.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-6">
      <Button variant="outline" size="lg" onClick={toggle} isLoading={loading} disabled={loading}>
        <Sparkles className="h-4 w-4" />
        <span>{open ? "Hide similar scholarships" : `Show ${limit} similar scholarships`}</span>
      </Button>

      {open && !loading && (
        <div className="mt-4">
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          {!error && items !== null && items.length === 0 && (
            <p className="text-sm text-neutral-600">
              No similar scholarships found. This row may not have a description
              embedding yet — run the embedding backfill to populate it.
            </p>
          )}

          {!error && items !== null && items.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((item) => (
                <div key={item.id} className="relative">
                  <ScholarshipCard scholarship={item} />
                  <span className="absolute bottom-3 right-3 z-10 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-sm">
                    {Math.round(item.similarity * 100)}% similar
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
