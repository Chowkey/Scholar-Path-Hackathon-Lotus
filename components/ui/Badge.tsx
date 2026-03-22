import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = {
  color?: "blue" | "green" | "amber" | "red" | "neutral" | "purple" | "orange" | "slate";
  children: ReactNode;
  className?: string;
};

const colors = {
  blue: "bg-blue-100 text-blue-800 border border-blue-200",
  green: "bg-green-100 text-green-800 border border-green-200",
  amber: "bg-yellow-100 text-yellow-800 border border-yellow-200",
  red: "bg-red-100 text-red-800 border border-red-200",
  neutral: "bg-neutral-200 text-neutral-800 border border-neutral-300",
  purple: "bg-purple-100 text-purple-800 border border-purple-200",
  orange: "bg-orange-100 text-orange-800 border border-orange-200",
  slate: "bg-slate-200 text-slate-800 border border-slate-300",
};

export function Badge({ color = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        colors[color],
        className,
      )}
    >
      {children}
    </span>
  );
}
