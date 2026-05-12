import { redirect } from "next/navigation";
import { EvaluatorClient } from "@/components/evaluator/EvaluatorClient";
import { factsToEvaluatorProfile } from "@/lib/profile-facts";
import { createServerClient } from "@/lib/supabase/server";
import { listFactsAsRecord } from "@/lib/user-facts";

export const dynamic = "force-dynamic";

type EvaluatorPageProps = {
  searchParams: Promise<{
    scholarship?: string | string[];
  }>;
};

export default async function EvaluatorPage({ searchParams }: EvaluatorPageProps) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/evaluator");

  const params = await searchParams;
  const scholarshipParam = params?.scholarship;
  const initialSelectedIds = Array.isArray(scholarshipParam)
    ? scholarshipParam.flatMap((value) => value.split(",")).filter(Boolean)
    : scholarshipParam?.split(",").filter(Boolean) ?? [];

  const facts = await listFactsAsRecord(supabase, user.id);
  const initialProfile = factsToEvaluatorProfile(facts);

  return (
    <EvaluatorClient
      initialSelectedIds={initialSelectedIds}
      initialProfile={initialProfile}
    />
  );
}
