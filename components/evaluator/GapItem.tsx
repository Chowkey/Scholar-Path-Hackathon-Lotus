type GapItemProps = {
  field: string;
  current: string;
  required: string;
  advice: string;
};

export function GapItem({ field, current, required, advice }: GapItemProps) {
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <p className="font-semibold text-neutral-900">{field}</p>
        <p className="text-sm text-neutral-600">
          You: {current} to Need: {required}
        </p>
      </div>
      <p className="mt-2 text-sm leading-6 text-neutral-600">{advice}</p>
    </div>
  );
}
