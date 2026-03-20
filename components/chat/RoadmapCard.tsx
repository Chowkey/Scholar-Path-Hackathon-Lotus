import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { findScholarshipByName } from "@/lib/chat";
import type { RoadmapData } from "@/lib/types";

type RoadmapCardProps = {
  roadmap: RoadmapData;
};

export function RoadmapCard({ roadmap }: RoadmapCardProps) {
  const linkedIds = roadmap.scholarships
    .map((item) => findScholarshipByName(item.name)?.id)
    .filter((value): value is string => Boolean(value));

  const query = linkedIds.join(",");

  return (
    <div className="max-w-2xl rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-warm-50 p-6">
      <h3 className="font-heading text-xl font-semibold text-neutral-900">Your Scholarship Roadmap</h3>

      <div className="mt-4 flex flex-wrap gap-2">
        {roadmap.scholarships.map((scholarship) => (
          <Badge key={`${scholarship.name}-${scholarship.country}`} color="blue" className="text-sm">
            {scholarship.name} · {scholarship.country} · {scholarship.deadline}
          </Badge>
        ))}
      </div>

      <ol className="mt-5 space-y-2 text-sm leading-6 text-neutral-700">
        {roadmap.nextSteps.map((step, index) => (
          <li key={step}>
            {index + 1}. {step}
          </li>
        ))}
      </ol>

      <div className="mt-5">
        <Link href={query ? `/evaluator?scholarship=${query}` : "/evaluator"}>
          <Button>Check my fit for these</Button>
        </Link>
      </div>
    </div>
  );
}
