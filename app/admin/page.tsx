import Link from "next/link";
import { ArrowRight, Database, Link2 } from "lucide-react";
import { Card } from "@/components/ui/Card";

const overviewCards = [
  {
    title: "Scholarship Records",
    description: "Create, edit, and remove scholarship entries stored in Supabase.",
    href: "/admin/scholarships",
    icon: Database,
  },
  {
    title: "Source Imports",
    description: "Paste scholarship source links and scrape them directly into Supabase.",
    href: "/admin/imports",
    icon: Link2,
  },
];

export default function AdminOverviewPage() {
  return (
    <div className="px-8 py-10 md:px-12">
      <div className="mx-auto max-w-6xl">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-stone-500">
            ScholarPath Admin
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold text-stone-900">
            Data operations, not just one more tab
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-stone-600">
            This workspace is where admins manage the scholarship database, prepare the knowledge
            base, and keep the assistant grounded with trustworthy content.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {overviewCards.map(({ title, description, href, icon: Icon }) => (
            <Card key={title} className="border-stone-200 bg-white/90">
              <div className="rounded-2xl bg-stone-100 p-3 text-stone-700 w-fit">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-heading text-xl font-semibold text-stone-900">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
              {href ? (
                <Link
                  href={href}
                  className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-amber-700 transition hover:text-amber-800"
                >
                  Open section
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <p className="mt-5 text-xs font-medium uppercase tracking-[0.2em] text-stone-400">
                  Coming soon
                </p>
              )}
            </Card>
          ))}
        </div>

        <Card className="mt-8 border-stone-200 bg-gradient-to-br from-white to-amber-50/60">
          <h2 className="font-heading text-2xl font-semibold text-stone-900">What admins can do now</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
            This admin workspace now focuses only on implemented tools: maintaining scholarship
            records and importing new ones from source links into the database.
          </p>
        </Card>
      </div>
    </div>
  );
}
