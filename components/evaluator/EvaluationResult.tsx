import Link from "next/link";
import { Search } from "lucide-react";
import { GapItem } from "@/components/evaluator/GapItem";
import { TrafficLight } from "@/components/evaluator/TrafficLight";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { EvaluationResult as EvaluationResultType } from "@/lib/types";

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
              <TrafficLight status={result.trafficLight} />
              <h3 className="font-heading text-xl font-semibold text-neutral-900">
                {result.scholarshipName}
              </h3>
            </div>
            <Badge color="blue" className="w-fit text-sm">
              {result.matchPercent}% match
            </Badge>
          </div>

          <p className="mt-4 italic text-neutral-600">{result.verdict}</p>

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
              {result.gaps.map((gap) => (
                <GapItem key={`${result.scholarshipId}-${gap.field}`} {...gap} />
              ))}
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
