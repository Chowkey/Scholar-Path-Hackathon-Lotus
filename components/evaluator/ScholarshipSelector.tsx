import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { Scholarship } from "@/lib/types";
import { cn } from "@/lib/utils";

type ScholarshipSelectorProps = {
  scholarships: Scholarship[];
  selectedIds: string[];
  onToggle: (scholarshipId: string) => void;
  warning?: string | null;
};

export function ScholarshipSelector({
  scholarships,
  selectedIds,
  onToggle,
  warning,
}: ScholarshipSelectorProps) {
  const [query, setQuery] = useState("");

  const filteredScholarships = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return scholarships;
    }

    return scholarships.filter((scholarship) =>
      [
        scholarship.name,
        scholarship.country,
        scholarship.organization,
        scholarship.field,
        scholarship.degree,
        scholarship.funding,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, scholarships]);

  const selectedScholarships = useMemo(
    () => scholarships.filter((scholarship) => selectedIds.includes(scholarship.id)),
    [scholarships, selectedIds],
  );

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a scholarship, country, organization, or field"
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-3 pl-11 pr-4 text-sm text-neutral-800 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {selectedScholarships.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {selectedScholarships.map((scholarship) => (
            <button
              key={scholarship.id}
              type="button"
              onClick={() => onToggle(scholarship.id)}
              className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-100"
            >
              <span>{scholarship.flag}</span>
              <span className="max-w-[180px] truncate">{scholarship.name}</span>
              <X className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
        {filteredScholarships.map((scholarship) => {
          const checked = selectedIds.includes(scholarship.id);

          return (
            <button
              key={scholarship.id}
              type="button"
              onClick={() => onToggle(scholarship.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                checked
                  ? "border-brand-400 bg-brand-50"
                  : "border-neutral-200 hover:border-brand-300 hover:bg-neutral-50",
              )}
            >
              <div
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded border text-xs font-bold transition",
                  checked
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-neutral-300 bg-white text-transparent",
                )}
              >
                ✓
              </div>
              <span className="text-lg">{scholarship.flag}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-900">{scholarship.name}</p>
                <p className="text-xs text-neutral-500">
                  {scholarship.country} · {scholarship.degree} · {scholarship.field || "General"}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {filteredScholarships.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          No matches for &quot;{query}&quot;. Try a scholarship name, country, or field.
        </p>
      ) : null}
      {warning ? <p className="mt-3 text-sm text-amber-600">{warning}</p> : null}
      <p className="mt-3 text-xs text-neutral-500">
        You can shortlist up to 3 scholarships for switching between feedback.
      </p>
    </div>
  );
}
