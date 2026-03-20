import { cn } from "@/lib/utils";

type TrafficLightProps = {
  status: "green" | "yellow" | "red";
};

const styles = {
  green: {
    label: "Strong fit",
    active: "bg-emerald-500",
    text: "text-emerald-600",
    index: 0,
  },
  yellow: {
    label: "Possible",
    active: "bg-amber-500",
    text: "text-amber-600",
    index: 1,
  },
  red: {
    label: "Big gaps",
    active: "bg-red-500",
    text: "text-red-500",
    index: 2,
  },
};

export function TrafficLight({ status }: TrafficLightProps) {
  const config = styles[status];

  return (
    <div className="inline-flex items-center gap-3">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={cn(
              "h-3 w-3 rounded-full bg-neutral-200",
              index === config.index && config.active,
            )}
          />
        ))}
      </div>
      <span className={cn("text-sm font-semibold", config.text)}>{config.label}</span>
    </div>
  );
}
