import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  subtitle: string;
};

export function EmptyState({ icon: Icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center shadow-card">
      <div className="mb-4 rounded-2xl bg-brand-50 p-4 text-brand-600">
        <Icon className="h-8 w-8" />
      </div>
      <h3 className="font-heading text-xl font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-neutral-600">{subtitle}</p>
    </div>
  );
}
