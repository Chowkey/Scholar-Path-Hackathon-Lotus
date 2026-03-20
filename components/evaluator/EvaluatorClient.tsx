"use client";

import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { EvaluationResult } from "@/components/evaluator/EvaluationResult";
import { ProfileForm } from "@/components/evaluator/ProfileForm";
import { ScholarshipSelector } from "@/components/evaluator/ScholarshipSelector";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { scholarships } from "@/lib/scholarships";
import type { EvaluationResult as EvaluationResultType, ProfileFormData } from "@/lib/types";

const initialProfile: ProfileFormData = {
  educationLevel: "undergraduate",
  gpa: 0,
  gpaScale: 4,
  ielts: undefined,
  toefl: undefined,
  sat: undefined,
  nationality: "",
  fieldOfStudy: "",
  degreeTarget: "masters",
};

type EvaluatorClientProps = {
  initialSelectedIds: string[];
};

export function EvaluatorClient({ initialSelectedIds }: EvaluatorClientProps) {
  const [profile, setProfile] = useState<ProfileFormData>(initialProfile);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [warning, setWarning] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileFormData, string>>>({});
  const [results, setResults] = useState<EvaluationResultType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedScholarships = scholarships.filter((scholarship) => selectedIds.includes(scholarship.id));

  const toggleScholarship = (scholarshipId: string) => {
    setWarning(null);

    if (selectedIds.includes(scholarshipId)) {
      setSelectedIds(selectedIds.filter((id) => id !== scholarshipId));
      return;
    }

    if (selectedIds.length >= 5) {
      setWarning("You can compare up to five scholarships at once.");
      return;
    }

    setSelectedIds([...selectedIds, scholarshipId]);
  };

  const validate = () => {
    const nextErrors: Partial<Record<keyof ProfileFormData, string>> = {};

    if (!profile.gpa) {
      nextErrors.gpa = "GPA is required.";
    }

    if (!profile.ielts) {
      nextErrors.ielts = "IELTS is required for this MVP.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const evaluate = async () => {
    if (!validate()) {
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          scholarships: selectedScholarships,
        }),
      });

      const payload = (await response.json()) as
        | { results: EvaluationResultType[] }
        | { error: string };

      if (!response.ok || !("results" in payload)) {
        throw new Error("error" in payload ? payload.error : "Evaluation failed.");
      }

      setResults(payload.results);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while evaluating your profile.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto max-w-7xl">
        <header>
          <h1 className="font-heading text-3xl font-bold text-neutral-900">Check My Fit</h1>
          <p className="mt-2 text-base leading-7 text-neutral-600">
            Compare your profile against shortlisted scholarships and see where you already match and what to improve next.
          </p>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_3fr]">
          <div className="space-y-6">
            <Card>
              <h2 className="font-heading text-xl font-semibold text-neutral-900">Your profile</h2>
              <div className="mt-5">
                <ProfileForm value={profile} onChange={setProfile} errors={errors} />
              </div>
            </Card>

            <Card>
              <h2 className="font-heading text-xl font-semibold text-neutral-900">Pick scholarships</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Choose up to five scholarships from the directory.
              </p>
              <div className="mt-4">
                <ScholarshipSelector
                  scholarships={scholarships}
                  selectedIds={selectedIds}
                  onToggle={toggleScholarship}
                  warning={warning}
                />
              </div>
              <Button
                onClick={() => void evaluate()}
                isLoading={isLoading}
                className="mt-5 w-full justify-center py-3"
              >
                Evaluate my fit
              </Button>
            </Card>
          </div>

          <div className="space-y-4">
            {errorMessage ? (
              <EmptyState
                icon={ClipboardList}
                title="We couldn&apos;t evaluate that profile"
                subtitle={errorMessage}
              />
            ) : null}
            <EvaluationResult results={results} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}
