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
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {scholarships.map((scholarship) => {
          const checked = selectedIds.includes(scholarship.id);

          return (
            <label
              key={scholarship.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition",
                checked
                  ? "border-brand-400 bg-brand-50"
                  : "border-neutral-200 hover:border-brand-300 hover:bg-neutral-50",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(scholarship.id)}
                className="h-4 w-4 rounded border-neutral-300 text-brand-500 focus:ring-brand-500"
              />
              <span className="text-lg">{scholarship.flag}</span>
              <div>
                <p className="text-sm font-semibold text-neutral-900">{scholarship.name}</p>
                <p className="text-xs text-neutral-500">{scholarship.country}</p>
              </div>
            </label>
          );
        })}
      </div>
      {warning ? <p className="mt-3 text-sm text-amber-600">{warning}</p> : null}
    </div>
  );
}
