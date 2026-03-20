import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { findScholarshipByName } from "@/lib/chat";

type ScholarshipChipProps = {
  name: string;
};

export function ScholarshipChip({ name }: ScholarshipChipProps) {
  const scholarship = findScholarshipByName(name);

  if (!scholarship) {
    return <strong>{name}</strong>;
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-600">
      <Link href={`/scholarships/${scholarship.id}`}>{scholarship.name}</Link>
      <Link href={`/evaluator?scholarship=${scholarship.id}`} className="inline-flex items-center gap-1 text-xs text-brand-500">
        <span>Check fit</span>
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </span>
  );
}
