import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DeadlineBadge } from "@/components/scholarships/DeadlineBadge";
import type { Scholarship } from "@/lib/types";

type ScholarshipCardProps = {
  scholarship: Scholarship;
};

export function ScholarshipCard({ scholarship }: ScholarshipCardProps) {
  return (
    <Link href={`/scholarships/${scholarship.id}`}>
      <Card hoverable className="h-full cursor-pointer p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-400">
              {scholarship.flag} {scholarship.country}
            </p>
          </div>
          <DeadlineBadge deadline={scholarship.deadline} />
        </div>

        <h3 className="mt-4 font-heading text-lg font-semibold text-neutral-900">
          {scholarship.name}
        </h3>
        <p className="mt-1 text-sm text-neutral-600">{scholarship.organization}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge color="blue">
            {scholarship.funding === "full" ? "Fully Funded" : "Partial"}
          </Badge>
          {scholarship.degree.map((degree) => (
            <Badge key={degree}>{degree}</Badge>
          ))}
          {scholarship.fields.slice(0, 2).map((field) => (
            <Badge key={field}>{field}</Badge>
          ))}
        </div>

        <div className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand-500">
          <span>View details</span>
          <ArrowRight className="h-4 w-4" />
        </div>
      </Card>
    </Link>
  );
}
