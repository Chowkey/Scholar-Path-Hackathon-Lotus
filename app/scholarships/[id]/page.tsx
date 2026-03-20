import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DeadlineBadge } from "@/components/scholarships/DeadlineBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { scholarshipsById } from "@/lib/scholarships";

type ScholarshipDetailPageProps = {
  params: { id: string };
};

export default function ScholarshipDetailPage({ params }: ScholarshipDetailPageProps) {
  const scholarship = scholarshipsById.get(params.id);

  if (!scholarship) {
    notFound();
  }

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/scholarships" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" />
          <span>Directory</span>
        </Link>

        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-400">
              {scholarship.flag} {scholarship.country}
            </p>
            <DeadlineBadge deadline={scholarship.deadline} />
          </div>

          <h1 className="mt-4 font-heading text-3xl font-bold text-neutral-900">
            {scholarship.name}
          </h1>
          <p className="mt-2 text-neutral-600">{scholarship.organization}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge color="blue">
              {scholarship.funding === "full" ? "Fully Funded" : "Partial"}
            </Badge>
            {scholarship.degree.map((degree) => (
              <Badge key={degree}>{degree}</Badge>
            ))}
            {scholarship.fields.map((field) => (
              <Badge key={field}>{field}</Badge>
            ))}
          </div>
        </section>

        <Card className="mt-6">
          <h2 className="font-heading text-xl font-semibold text-neutral-900">Overview</h2>
          <p className="mt-3 whitespace-pre-line text-base leading-7 text-neutral-600">
            {scholarship.description}
          </p>
        </Card>

        <Card className="mt-6">
          <h2 className="font-heading text-xl font-semibold text-neutral-900">What you need</h2>
          <div className="mt-4 divide-y divide-neutral-200">
            {[
              ["GPA", scholarship.requirements.gpa ?? "Not specified"],
              ["IELTS", scholarship.requirements.ielts ?? "Not specified"],
              ["TOEFL", scholarship.requirements.toefl ?? "Not specified"],
              ["Essays", scholarship.requirements.essays.join(", ")],
              ["Other", scholarship.requirements.other.join(", ")],
            ].map(([label, value]) => (
              <div key={label} className="grid gap-2 py-4 md:grid-cols-[140px_1fr]">
                <p className="text-sm font-semibold text-neutral-900">{label}</p>
                <p className="text-sm leading-6 text-neutral-600">{value}</p>
              </div>
            ))}
          </div>
        </Card>

        <section className="mt-6 rounded-2xl border border-brand-100 bg-brand-50 p-6">
          <h2 className="font-heading text-xl font-semibold text-brand-900">Ready to assess your fit?</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Compare your profile against this scholarship and get a practical gap analysis.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/evaluator?scholarship=${scholarship.id}`}>
              <Button size="lg">Check if you&apos;re a fit</Button>
            </Link>
            <a href={scholarship.link} target="_blank" rel="noreferrer">
              <Button variant="outline" size="lg">
                <span>Official application</span>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
