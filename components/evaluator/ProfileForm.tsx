import type { ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import type { ProfileFormData } from "@/lib/types";

type ProfileFormProps = {
  value: ProfileFormData;
  onChange: (value: ProfileFormData) => void;
  errors: Partial<Record<keyof ProfileFormData, string>>;
};

const inputClasses =
  "w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export function ProfileForm({ value, onChange, errors }: ProfileFormProps) {
  const update =
    <K extends keyof ProfileFormData>(key: K) =>
      (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const rawValue = event.target.value;
        let newValue: string | number | undefined = rawValue;

        if (key === "gpa" || key === "ielts" || key === "toefl" || key === "sat") {
          if (rawValue === "") {
            newValue = key === "gpa" ? 0 : undefined;
          } else {
            const num = Number(rawValue);
            const maxVal =
              key === "gpa"
                ? value.gpaScale
                : key === "ielts"
                  ? 9
                  : key === "toefl"
                    ? 120
                    : 1600;

            newValue = isNaN(num) ? undefined : Math.min(maxVal, Math.max(0, num));
          }
        } else if (key === "gpaScale") {
          newValue = Number(rawValue);
        }

        onChange({
          ...value,
          [key]: newValue,
        } as ProfileFormData);
      };

  return (
    <div className="space-y-4">
      <Field label="Education level" error={errors.educationLevel}>
        <select value={value.educationLevel} onChange={update("educationLevel")} className={inputClasses}>
          <option value="high_school">High school</option>
          <option value="undergraduate">Undergraduate</option>
          <option value="graduate">Graduate</option>
        </select>
      </Field>

      <div className="grid gap-4 md:grid-cols-[1fr_120px]">
        <Field label="GPA" error={errors.gpa}>
          <input
            type="number"
            step="0.1"
            min="0"
            max={value.gpaScale}
            value={value.gpa === 0 ? "" : value.gpa}
            onChange={update("gpa")}
            placeholder="e.g. 3.5"
            className={cn(inputClasses, errors.gpa && "border-danger focus:ring-red-100")}
          />
        </Field>
        <Field label="Scale">
          <select value={value.gpaScale} onChange={update("gpaScale")} className={inputClasses}>
            <option value={4}>/4.0</option>
            <option value={10}>/10</option>
            <option value={100}>Percentage</option>
          </select>
        </Field>
      </div>

      <Field label="IELTS score" error={errors.ielts}>
        <input
          type="number"
          step="0.5"
          min="0"
          max="9"
          value={value.ielts ?? ""}
          onChange={update("ielts")}
          placeholder="e.g. 7.0"
          className={cn(inputClasses, errors.ielts && "border-danger focus:ring-red-100")}
        />
      </Field>

      <Field label="TOEFL score">
        <input
          type="number"
          min="0"
          max={120}
          value={value.toefl ?? ""}
          onChange={update("toefl")}
          placeholder="e.g. 100"
          className={inputClasses}
        />
      </Field>

      <Field label="SAT score">
        <input
          type="number"
          min="0"
          max={1600}
          value={value.sat ?? ""}
          onChange={update("sat")}
          placeholder="e.g. 1400"
          className={inputClasses}
        />
      </Field>

      <Field label="Nationality">
        <input value={value.nationality} onChange={update("nationality")} placeholder="e.g. Vietnamese" className={inputClasses} />
      </Field>

      <Field label="Field of study">
        <input value={value.fieldOfStudy} onChange={update("fieldOfStudy")} placeholder="e.g. Computer Science" className={inputClasses} />
      </Field>

      <Field label="Degree target">
        <select value={value.degreeTarget} onChange={update("degreeTarget")} className={inputClasses}>
          <option value="undergraduate">Undergraduate</option>
          <option value="masters">Masters</option>
          <option value="phd">PhD</option>
        </select>
      </Field>

      <Field
        label="Projects or portfolio work"
        hint="Optional, but helpful for fit analysis. Add 1-3 concrete examples if you have them."
      >
        <textarea
          rows={3}
          value={value.projectExperience ?? ""}
          onChange={update("projectExperience")}
          placeholder="e.g. Built a student expense tracker app, research assistant on water quality analysis, designed a campus sustainability campaign"
          className={cn(inputClasses, "resize-y")}
        />
      </Field>

      <Field
        label="Extracurricular activities"
        hint="Optional. Clubs, volunteering, competitions, leadership roles, community work, and similar experience all count."
      >
        <textarea
          rows={3}
          value={value.extracurricularActivities ?? ""}
          onChange={update("extracurricularActivities")}
          placeholder="e.g. Vice president of coding club, volunteer math tutor, Model UN, debate team, local NGO volunteer"
          className={cn(inputClasses, "resize-y")}
        />
      </Field>
    </div>
  );
}

type FieldProps = {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
};

function Field({ label, children, error, hint }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-neutral-700">{label}</span>
      {hint ? <span className="mb-2 block text-xs leading-5 text-neutral-500">{hint}</span> : null}
      {children}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}
