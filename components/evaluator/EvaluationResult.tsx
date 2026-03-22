"use client";

import { useEffect, useState } from "react";
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
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  if (isLoading) {
    return (
      <Card className="space-y-4">
        <div className="flex gap-2">
          {[0, 1].map((item) => (
            <div key={item} className="h-9 w-28 animate-pulse rounded-full bg-neutral-100" />
          ))}
        </div>
        <div className="h-6 w-40 animate-pulse rounded bg-neutral-100" />
        <div className="h-4 w-full animate-pulse rounded bg-neutral-100" />
        <div className="h-24 animate-pulse rounded bg-neutral-50" />
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="Your results will appear here"
        subtitle="Add your profile details, choose up to three scholarships, and evaluate your fit."
      />
    );
  }

  const activeResult = results[Math.min(activeIndex, results.length - 1)] ?? results[0];

  return (
    <div className="space-y-4">
      {results.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {results.map((result, index) => (
            <button
              key={result.scholarshipId}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={cn(
                "rounded-full border px-3 py-2 text-sm font-medium transition",
                index === activeIndex
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-brand-300 hover:text-brand-700",
              )}
            >
              {result.scholarshipName}
            </button>
          ))}
        </div>
      ) : null}

      <Card key={activeResult.scholarshipId}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div
              className={cn(
                "w-fit text-sm font-semibold",
                activeResult.trafficLight === "green" && "text-emerald-600",
                activeResult.trafficLight === "yellow" && "text-amber-600",
                activeResult.trafficLight === "red" && "text-red-500",
              )}
            >
              {activeResult.trafficLight === "green" && "Strong fit"}
              {activeResult.trafficLight === "yellow" && "Possible"}
              {activeResult.trafficLight === "red" && "Big gaps"}
            </div>
            <h3 className="font-heading text-xl font-semibold text-neutral-900">
              {activeResult.scholarshipName}
            </h3>
          </div>
          <Badge color="blue" className="w-fit text-sm">
            {activeResult.matchPercent}% match
          </Badge>
        </div>

        <p className="mt-4 italic text-neutral-600">{activeResult.verdict}</p>

        {activeResult.universityData && activeResult.universityData.length > 0 ? (
          <div className="mt-5">
            <h4 className="mb-3 text-sm font-semibold text-neutral-900">Partner Universities & Acceptance Rates</h4>
            <div className="grid gap-2">
              {activeResult.universityData.map((uni) => (
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
        ) : null}

        <div className="mt-5 border-t border-neutral-200 pt-5">
          <h4 className="text-sm font-semibold text-neutral-900">Strengths</h4>
          <div className="mt-3 space-y-2">
            {activeResult.strengths.map((strength) => (
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
            {activeResult.gaps.length === 0 ? (
              <div className="rounded-lg bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-700">No gaps identified. You meet the requirements.</p>
              </div>
            ) : (
              activeResult.gaps.map((gap) => (
                <GapItem key={`${activeResult.scholarshipId}-${gap.field}`} {...gap} />
              ))
            )}
          </div>
        </div>

        <Link
          href={`/scholarships/${activeResult.scholarshipId}`}
          className="mt-5 inline-flex text-sm font-medium text-brand-500 hover:text-brand-600"
        >
          View scholarship
        </Link>
      </Card>
    </div>
  );
}
