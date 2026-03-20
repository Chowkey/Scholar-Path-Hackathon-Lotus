import { cn } from "@/lib/utils";

type FilterGroup = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

type FilterBarProps = {
  groups: FilterGroup[];
};

export function FilterBar({ groups }: FilterBarProps) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm font-semibold text-neutral-600">{group.label}</span>
          {group.options.map((option) => {
            const active = option === group.value;

            return (
              <button
                key={option}
                type="button"
                onClick={() => group.onChange(option)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition",
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-600"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-brand-400 hover:text-brand-600",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
