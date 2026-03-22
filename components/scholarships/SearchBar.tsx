type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Search by scholarship, country, organization, or field"
      className="w-full rounded-xl border-2 border-brand-300 bg-white px-5 py-4 text-base font-medium text-neutral-900 shadow-md placeholder:text-neutral-500 outline-none transition-all hover:border-brand-400 hover:shadow-lg focus:border-brand-500 focus:ring-4 focus:ring-brand-200/50"
    />
  );
}
