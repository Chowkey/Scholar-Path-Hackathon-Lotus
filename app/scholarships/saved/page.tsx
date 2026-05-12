import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ScholarshipCard } from "@/components/scholarships/ScholarshipCard";
import { listSaved } from "@/lib/saved-scholarships";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SavedScholarshipsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/scholarships/saved");

  const scholarships = await listSaved(supabase, user.id);

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-neutral-900">
              Saved scholarships
            </h1>
            <p className="mt-2 text-base text-neutral-600">
              Scholarships you have bookmarked for follow-up.
            </p>
          </div>
          <Link href="/scholarships">
            <Button variant="outline">Browse all</Button>
          </Link>
        </header>

        {scholarships.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center">
            <div className="mx-auto mb-4 w-fit rounded-2xl bg-brand-50 p-4 text-brand-600">
              <Bookmark className="h-7 w-7" />
            </div>
            <h2 className="font-heading text-xl font-bold text-neutral-900">No saves yet</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Bookmark a scholarship from the directory to see it here.
            </p>
            <Link href="/scholarships" className="mt-5 inline-block">
              <Button>Browse scholarships</Button>
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {scholarships.map((s) => (
              <ScholarshipCard key={s.id} scholarship={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
