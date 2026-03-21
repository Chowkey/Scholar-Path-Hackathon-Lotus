type GapItemProps = {
  field: string;
  current: string;
  required: string;
  advice: string;
};

export function GapItem({ field, current, required, advice }: GapItemProps) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="font-semibold text-amber-900">{field}</p>
      
      <div className="mt-3 space-y-2">
        <div className="bg-white rounded-md p-3">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Your Status</p>
          <p className="mt-1 text-sm font-medium text-neutral-700">{current}</p>
        </div>
        
        <div className="bg-white rounded-md p-3">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">What's Needed</p>
          <p className="mt-1 text-sm font-medium text-amber-700">{required}</p>
        </div>
      </div>

      <div className="mt-3 border-t border-amber-200 pt-3">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">How to improve</p>
        <p className="mt-2 text-sm leading-6 text-neutral-700">{advice}</p>
      </div>
    </div>
  );
}
