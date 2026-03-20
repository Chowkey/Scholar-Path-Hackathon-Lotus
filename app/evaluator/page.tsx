import { EvaluatorClient } from "@/components/evaluator/EvaluatorClient";

type EvaluatorPageProps = {
  searchParams?: {
    scholarship?: string;
  };
};

export default function EvaluatorPage({ searchParams }: EvaluatorPageProps) {
  const initialSelectedIds = searchParams?.scholarship?.split(",").filter(Boolean) ?? [];

  return <EvaluatorClient initialSelectedIds={initialSelectedIds} />;
}
