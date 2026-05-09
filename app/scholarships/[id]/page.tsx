import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DeadlineBadge } from "@/components/scholarships/DeadlineBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { createBrowserClient } from "@/lib/supabase";
import {
  rowToScholarship,
  SCHOLARSHIP_SELECT,
  type ScholarshipJoinedRow,
} from "@/lib/scholarshipTransform";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ScholarshipDetailPageProps = {
  params: Promise<{ id: string }>;
};

function renderLanguageValue(value?: string): string {
  return value && value.trim() ? value : "Not specified";
}

export default async function ScholarshipDetailPage({
  params,
}: ScholarshipDetailPageProps) {
  const { id } = await params;
  const db = createBrowserClient();
  const { data, error } = await db
    .from("scholarships")
    .select(SCHOLARSHIP_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const scholarship = rowToScholarship(data as unknown as ScholarshipJoinedRow);

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/scholarships"
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-brand-600"
        >
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
            {scholarship.funding !== "Not specified" && (
              <Badge color="blue">{scholarship.funding}</Badge>
            )}
            {scholarship.degree !== "Not specified" && (
              <Badge>{scholarship.degree}</Badge>
            )}
            {scholarship.field !== "Not specified" && (
              <Badge>{scholarship.field}</Badge>
            )}
          </div>
        </section>

        <Card className="mt-6">
          <h2 className="font-heading text-xl font-semibold text-neutral-900">Overview</h2>
          <div className="prose prose-sm md:prose-base mt-3 max-w-none text-neutral-600 prose-headings:font-heading prose-headings:font-semibold prose-a:text-brand-600 hover:prose-a:text-brand-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {scholarship.description || "Not specified."}
            </ReactMarkdown>
          </div>
        </Card>

        <Card className="mt-6">
          <h2 className="font-heading text-xl font-semibold text-neutral-900">
            Academic Requirements
          </h2>
          <div className="prose prose-sm mt-3 max-w-none text-neutral-600 prose-headings:font-heading prose-headings:font-semibold prose-a:text-brand-600 hover:prose-a:text-brand-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {scholarship.academicRequirements || "Not specified."}
            </ReactMarkdown>
          </div>
        </Card>

        <Card className="mt-6">
          <h2 className="font-heading text-xl font-semibold text-neutral-900">
            Language Requirements
          </h2>
          <div className="mt-4 divide-y divide-neutral-200">
            {[
              ["IELTS", renderLanguageValue(scholarship.languageRequirements.ielts)],
              ["TOEFL", renderLanguageValue(scholarship.languageRequirements.toefl)],
              ["PTE", renderLanguageValue(scholarship.languageRequirements.pte)],
              ["Duolingo", renderLanguageValue(scholarship.languageRequirements.duolingo)],
              [
                "Other",
                scholarship.languageRequirements.other.join(", ") || "Not specified",
              ],
            ].map(([label, value]) => (
              <div key={label} className="grid gap-2 py-4 md:grid-cols-[140px_1fr]">
                <p className="text-sm font-semibold text-neutral-900">{label}</p>
                <p className="text-sm leading-6 text-neutral-600">{value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="mt-6">
          <h2 className="font-heading text-xl font-semibold text-neutral-900">
            Other Requirements
          </h2>
          <div className="prose prose-sm mt-3 max-w-none text-neutral-600 prose-headings:font-heading prose-headings:font-semibold prose-a:text-brand-600 hover:prose-a:text-brand-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {scholarship.otherRequirements || "Not specified."}
            </ReactMarkdown>
          </div>
        </Card>

        <section className="mt-6 rounded-2xl border border-brand-100 bg-brand-50 p-6">
          <h2 className="font-heading text-xl font-semibold text-brand-900">
            Ready to assess your fit?
          </h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Compare your profile against this scholarship and get a practical gap
            analysis.
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
