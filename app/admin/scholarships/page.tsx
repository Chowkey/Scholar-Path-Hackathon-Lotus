"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { COUNTRY_OPTIONS, DEGREE_LEVEL_OPTIONS } from "@/lib/scholarshipOptions";
import type { Scholarship } from "@/lib/types";

type ScholarshipFormState = {
  id: string;
  name: string;
  country: string;
  flag: string;
  organization: string;
  degree: string;
  funding: string;
  field: string;
  deadline: string;
  description: string;
  academicRequirements: string;
  languageIelts: string;
  languageToefl: string;
  languagePte: string;
  languageDuolingo: string;
  languageOther: string;
  otherRequirements: string;
  link: string;
  sourceName: string;
  sourceUrl: string;
};

const emptyFormState: ScholarshipFormState = {
  id: "",
  name: "",
  country: "United States",
  flag: "",
  organization: "",
  degree: "Master",
  funding: "",
  field: "",
  deadline: "",
  description: "",
  academicRequirements: "",
  languageIelts: "",
  languageToefl: "",
  languagePte: "",
  languageDuolingo: "",
  languageOther: "",
  otherRequirements: "",
  link: "",
  sourceName: "",
  sourceUrl: "",
};

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function scholarshipToFormState(value: Scholarship): ScholarshipFormState {
  return {
    id: value.id,
    name: value.name,
    country: value.country,
    flag: value.flag,
    organization: value.organization,
    degree: value.degree,
    funding: value.funding,
    field: value.field,
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(value.deadline) ? value.deadline : "",
    description: value.description,
    academicRequirements: value.academicRequirements,
    languageIelts: value.languageRequirements.ielts ?? "",
    languageToefl: value.languageRequirements.toefl ?? "",
    languagePte: value.languageRequirements.pte ?? "",
    languageDuolingo: value.languageRequirements.duolingo ?? "",
    languageOther: value.languageRequirements.other.join(", "),
    otherRequirements: value.otherRequirements,
    link: value.link,
    sourceName: value.sourceName ?? "",
    sourceUrl: value.sourceUrl ?? "",
  };
}

function formStateToScholarship(value: ScholarshipFormState): Scholarship {
  return {
    id: value.id.trim() || slugify(value.name),
    name: value.name.trim(),
    country: value.country.trim(),
    flag: value.flag.trim(),
    organization: value.organization.trim(),
    degree: value.degree.trim(),
    funding: value.funding.trim(),
    field: value.field.trim(),
    academicRequirements: value.academicRequirements.trim(),
    languageRequirements: {
      ielts: value.languageIelts.trim() || undefined,
      toefl: value.languageToefl.trim() || undefined,
      pte: value.languagePte.trim() || undefined,
      duolingo: value.languageDuolingo.trim() || undefined,
      other: splitCsv(value.languageOther),
    },
    otherRequirements: value.otherRequirements.trim(),
    deadline: value.deadline.trim(),
    description: value.description.trim(),
    link: value.link.trim(),
    sourceName: value.sourceName.trim(),
    sourceUrl: value.sourceUrl.trim(),
  };
}

export default function AdminScholarshipsPage() {
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState<ScholarshipFormState>(emptyFormState);

  const isEditing = useMemo(() => Boolean(editingId), [editingId]);
  const countryOptions = useMemo(() => COUNTRY_OPTIONS, []);
  const degreeOptions = useMemo(() => DEGREE_LEVEL_OPTIONS, []);

  async function loadScholarships() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/scholarships", { cache: "no-store" });
      const payload = (await response.json()) as Scholarship[] | { error?: string };

      if (!response.ok || !Array.isArray(payload)) {
        const message =
          !Array.isArray(payload) && payload.error
            ? payload.error
            : "Unable to load scholarships.";
        throw new Error(message);
      }

      setScholarships(payload);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to load scholarships.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadScholarships();
  }, []);

  function openCreateModal() {
    setFormState(emptyFormState);
    setFormError(null);
    setEditingId(null);
    setIsModalOpen(true);
  }

  function openEditModal(value: Scholarship) {
    setFormState(scholarshipToFormState(value));
    setFormError(null);
    setEditingId(value.id);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setFormError(null);
    setEditingId(null);
  }

  function updateFormField<K extends keyof ScholarshipFormState>(
    key: K,
    value: ScholarshipFormState[K]
  ) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  async function saveScholarship(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const payload = formStateToScholarship(formState);
    if (
      !payload.id ||
      !payload.name ||
      !payload.country ||
      !payload.organization ||
      !payload.degree ||
      !payload.deadline ||
      !payload.link
    ) {
      setFormError("id/name/country/organization/degree/deadline/link are required.");
      return;
    }

    setIsSaving(true);

    try {
      const endpoint = isEditing ? `/api/scholarships/${editingId}` : "/api/scholarships";
      const method = isEditing ? "PUT" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as Scholarship | { error?: string };

      if (!response.ok) {
        const message =
          typeof result === "object" && result && "error" in result && result.error
            ? result.error
            : "Unable to save scholarship.";
        throw new Error(message);
      }

      await loadScholarships();
      closeModal();
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to save scholarship.";
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteScholarship(id: string, name: string) {
    const confirmed = window.confirm(`Delete "${name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setDeletingId(id);
    setError(null);

    try {
      const response = await fetch(`/api/scholarships/${id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Unable to delete scholarship.");
      }

      setScholarships((current) => current.filter((item) => item.id !== id));
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to delete scholarship.";
      setError(message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-neutral-900">
              Scholarship Admin
            </h1>
            <p className="mt-2 text-base leading-7 text-neutral-600">
              Manage scholarship records in Supabase.
            </p>
          </div>
          <Button onClick={openCreateModal}>
            <Plus className="h-4 w-4" />
            Add New
          </Button>
        </div>

        {error ? (
          <div className="mt-6">
            <EmptyState icon={AlertTriangle} title="Admin action failed" subtitle={error} />
          </div>
        ) : null}

        <Card className="mt-6 overflow-hidden p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-neutral-500">
              <Spinner className="mr-3 h-5 w-5" />
              <span>Loading scholarships...</span>
            </div>
          ) : scholarships.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ShieldCheck}
                title="No scholarships found"
                subtitle="Create your first scholarship to populate the directory."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Scholarship</th>
                    <th className="px-4 py-3 font-semibold">Country</th>
                    <th className="px-4 py-3 font-semibold">Degree</th>
                    <th className="px-4 py-3 font-semibold">Funding</th>
                    <th className="px-4 py-3 font-semibold">Deadline</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {scholarships.map((scholarship) => (
                    <tr key={scholarship.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-neutral-900">
                          {scholarship.flag} {scholarship.name}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">{scholarship.organization}</p>
                        <p className="mt-1 text-xs text-neutral-400">ID: {scholarship.id}</p>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{scholarship.country}</td>
                      <td className="px-4 py-3 text-neutral-700">{scholarship.degree}</td>
                      <td className="px-4 py-3">
                        <Badge color="blue">{scholarship.funding || "Not specified"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{scholarship.deadline}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditModal(scholarship)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            isLoading={deletingId === scholarship.id}
                            onClick={() =>
                              void deleteScholarship(scholarship.id, scholarship.name)
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-modal">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-heading text-2xl font-semibold text-neutral-900">
                  {isEditing ? "Edit Scholarship" : "Add Scholarship"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Close form"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveScholarship} className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">ID</span>
                <input
                  value={formState.id}
                  onChange={(event) => updateFormField("id", event.target.value)}
                  placeholder="optional (auto-generated from name if blank)"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                  disabled={isEditing}
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Name *</span>
                <input
                  value={formState.name}
                  onChange={(event) => updateFormField("name", event.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                  required
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Country *</span>
                <select
                  value={formState.country}
                  onChange={(event) => updateFormField("country", event.target.value)}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                >
                  {countryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Flag</span>
                <input
                  value={formState.flag}
                  onChange={(event) => updateFormField("flag", event.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Organization *</span>
                <input
                  value={formState.organization}
                  onChange={(event) => updateFormField("organization", event.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                  required
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Degree *</span>
                <select
                  value={formState.degree}
                  onChange={(event) => updateFormField("degree", event.target.value)}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                >
                  {degreeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Funding *</span>
                <input
                  value={formState.funding}
                  onChange={(event) => updateFormField("funding", event.target.value)}
                  placeholder="e.g. Full tuition + stipend, USD 10000"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                  required
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Field of Study *</span>
                <input
                  value={formState.field}
                  onChange={(event) => updateFormField("field", event.target.value)}
                  placeholder="Medicine, Law, Computer Science"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                  required
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Deadline *</span>
                <input
                  type="date"
                  value={formState.deadline}
                  onChange={(event) => updateFormField("deadline", event.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                  required
                />
              </label>

              <label className="text-sm md:col-span-2">
                <span className="mb-1 block font-medium text-neutral-700">Description</span>
                <textarea
                  value={formState.description}
                  onChange={(event) => updateFormField("description", event.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                />
              </label>

              <label className="text-sm md:col-span-2">
                <span className="mb-1 block font-medium text-neutral-700">
                  Academic Requirements
                </span>
                <textarea
                  value={formState.academicRequirements}
                  onChange={(event) =>
                    updateFormField("academicRequirements", event.target.value)
                  }
                  rows={4}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">IELTS</span>
                <input
                  value={formState.languageIelts}
                  onChange={(event) => updateFormField("languageIelts", event.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">TOEFL</span>
                <input
                  value={formState.languageToefl}
                  onChange={(event) => updateFormField("languageToefl", event.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">PTE</span>
                <input
                  value={formState.languagePte}
                  onChange={(event) => updateFormField("languagePte", event.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Duolingo</span>
                <input
                  value={formState.languageDuolingo}
                  onChange={(event) =>
                    updateFormField("languageDuolingo", event.target.value)
                  }
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                />
              </label>

              <label className="text-sm md:col-span-2">
                <span className="mb-1 block font-medium text-neutral-700">
                  Other Language Requirements
                </span>
                <input
                  value={formState.languageOther}
                  onChange={(event) => updateFormField("languageOther", event.target.value)}
                  placeholder="comma separated"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                />
              </label>

              <label className="text-sm md:col-span-2">
                <span className="mb-1 block font-medium text-neutral-700">
                  Other Requirements
                </span>
                <textarea
                  value={formState.otherRequirements}
                  onChange={(event) =>
                    updateFormField("otherRequirements", event.target.value)
                  }
                  rows={3}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                />
              </label>

              <label className="text-sm md:col-span-2">
                <span className="mb-1 block font-medium text-neutral-700">Link *</span>
                <input
                  type="url"
                  value={formState.link}
                  onChange={(event) => updateFormField("link", event.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                  required
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Source Name</span>
                <input
                  value={formState.sourceName}
                  onChange={(event) => updateFormField("sourceName", event.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Source URL</span>
                <input
                  type="url"
                  value={formState.sourceUrl}
                  onChange={(event) => updateFormField("sourceUrl", event.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
                />
              </label>

              {formError ? (
                <p className="text-sm font-medium text-red-600 md:col-span-2">{formError}</p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3 md:col-span-2">
                <Button type="button" variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSaving}>
                  {isEditing ? "Save changes" : "Create scholarship"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
