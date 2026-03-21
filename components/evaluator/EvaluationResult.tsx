import Link from "next/link";
import { Search } from "lucide-react";
import { GapItem } from "@/components/evaluator/GapItem";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { EvaluationResult as EvaluationResultType } from "@/lib/types";
import { cn } from "@/lib/utils";

type EvaluationResultProps = {
  results: EvaluationResultType[];
  isLoading: boolean;
};

export function EvaluationResult({ results, isLoading }: EvaluationResultProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((item) => (
          <Card key={item} className="space-y-4">
            <div className="h-6 w-40 animate-pulse rounded bg-neutral-100" />
            <div className="h-4 w-full animate-pulse rounded bg-neutral-100" />
            <div className="h-24 animate-pulse rounded bg-neutral-50" />
          </Card>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="Your results will appear here"
        subtitle="Add your profile details, choose up to five scholarships, and evaluate your fit."
      />
    );
  }

  return (
    <div className="space-y-4">
      {results.map((result) => (
        <Card key={result.scholarshipId}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div
                className={cn(
                  "text-sm font-semibold w-fit",
                  result.trafficLight === "green" && "text-emerald-600",
                  result.trafficLight === "yellow" && "text-amber-600",
                  result.trafficLight === "red" && "text-red-500",
                )}
              >
                {result.trafficLight === "green" && "Strong fit"}
                {result.trafficLight === "yellow" && "Possible"}
                {result.trafficLight === "red" && "Big gaps"}
              </div>
              <h3 className="font-heading text-xl font-semibold text-neutral-900">
                {result.scholarshipName}
              </h3>
            </div>
            <Badge color="blue" className="w-fit text-sm">
              {result.matchPercent}% match
            </Badge>
          </div>

          <p className="mt-4 italic text-neutral-600">{result.verdict}</p>

          {/* Universities & Acceptance Rates */}
          {result.universityData && result.universityData.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-3 text-sm font-semibold text-neutral-900">Partner Universities & Acceptance Rates</h4>
              <div className="grid gap-2">
                {result.universityData.map((uni) => (
                  <div key={uni.name} className="flex items-center justify-between rounded-lg bg-blue-50 p-3">
                    <p className="text-sm font-medium text-neutral-700">{uni.name}</p>
                    <p className="text-sm font-bold text-blue-600">
                      {uni.acceptanceRate !== null
                        ? `${(uni.acceptanceRate * 100).toFixed(1)}%`
                        : "N/A"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-neutral-200 pt-5">
            <h4 className="text-sm font-semibold text-neutral-900">Strengths</h4>
            <div className="mt-3 space-y-2">
              {result.strengths.map((strength) => (
                <div key={strength} className="flex items-start gap-2 text-sm leading-6 text-neutral-700">
                  <span className="mt-2 h-2 w-2 rounded-full bg-emerald-500" />
                  <span>{strength}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <h4 className="text-sm font-semibold text-neutral-900">Gaps to address</h4>
            <div className="mt-3 space-y-3">
              {result.gaps.length === 0 ? (
                <div className="rounded-lg bg-emerald-50 p-4">
                  <p className="text-sm font-medium text-emerald-700">✓ No gaps identified! You meet the requirements.</p>
                </div>
              ) : (
                result.gaps.map((gap) => (
                  <GapItem key={`${result.scholarshipId}-${gap.field}`} {...gap} />
                ))
              )}
            </div>
          </div>

          <Link
            href={`/scholarships/${result.scholarshipId}`}
            className="mt-5 inline-flex text-sm font-medium text-brand-500 hover:text-brand-600"
          >
            View scholarship
          </Link>
        </Card>
      ))}
    </div>
  );
}
