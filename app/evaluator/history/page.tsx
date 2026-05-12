import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { listUserEvaluations } from "@/lib/evaluations";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const lightLabel: Record<string, string> = {
  green: "Strong fit",
  yellow: "Possible with work",
  red: "Significant gaps",
};

export default async function EvaluatorHistoryPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/evaluator/history");

  const evaluations = await listUserEvaluations(supabase, user.id);

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-neutral-900">
              Evaluation history
            </h1>
            <p className="mt-2 text-base text-neutral-600">
              Past profile-vs-scholarship runs you have generated.
            </p>
          </div>
          <Link href="/evaluator">
            <Button variant="outline">New evaluation</Button>
          </Link>
        </header>

        {evaluations.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center">
            <div className="mx-auto mb-4 w-fit rounded-2xl bg-brand-50 p-4 text-brand-600">
              <BarChart2 className="h-7 w-7" />
            </div>
            <h2 className="font-heading text-xl font-bold text-neutral-900">No evaluations yet</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Run your first evaluation to see results here.
            </p>
            <Link href="/evaluator" className="mt-5 inline-block">
              <Button>Start evaluation</Button>
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-4">
            {evaluations.map((evaluation) => {
              const counts = { green: 0, yellow: 0, red: 0 } as Record<string, number>;
              for (const r of evaluation.results) counts[r.trafficLight] = (counts[r.trafficLight] ?? 0) + 1;
              return (
                <li key={evaluation.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-neutral-900">
                      {format(new Date(evaluation.created_at), "PPp")}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {evaluation.scholarship_ids.length} scholarship
                      {evaluation.scholarship_ids.length === 1 ? "" : "s"} evaluated
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {(["green", "yellow", "red"] as const).map((light) =>
                      counts[light] ? (
                        <span
                          key={light}
                          className={
                            light === "green"
                              ? "rounded-full bg-emerald-50 px-3 py-1 text-emerald-700"
                              : light === "yellow"
                                ? "rounded-full bg-amber-50 px-3 py-1 text-amber-700"
                                : "rounded-full bg-red-50 px-3 py-1 text-red-700"
                          }
                        >
                          {counts[light]} · {lightLabel[light]}
                        </span>
                      ) : null,
                    )}
                  </div>
                  <ul className="mt-4 space-y-1 text-sm text-neutral-700">
                    {evaluation.results.slice(0, 5).map((r) => (
                      <li key={r.scholarshipId} className="flex items-center justify-between gap-2">
                        <span className="truncate">{r.scholarshipName}</span>
                        <span className="shrink-0 text-xs text-neutral-500">{r.matchPercent}%</span>
                      </li>
                    ))}
                    {evaluation.results.length > 5 ? (
                      <li className="text-xs text-neutral-500">
                        + {evaluation.results.length - 5} more
                      </li>
                    ) : null}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
