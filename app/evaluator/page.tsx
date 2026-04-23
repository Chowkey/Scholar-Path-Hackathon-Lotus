import { EvaluatorClient } from "@/components/evaluator/EvaluatorClient";

type EvaluatorPageProps = {
  searchParams: Promise<{
    scholarship?: string | string[];
  }>;
};

export default async function EvaluatorPage({ searchParams }: EvaluatorPageProps) {
  const params = await searchParams;
  const scholarshipParam = params?.scholarship;
  const initialSelectedIds = Array.isArray(scholarshipParam)
    ? scholarshipParam.flatMap((value) => value.split(",")).filter(Boolean)
    : scholarshipParam?.split(",").filter(Boolean) ?? [];

  return <EvaluatorClient initialSelectedIds={initialSelectedIds} />;
}
