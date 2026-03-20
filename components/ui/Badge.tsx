import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = {
  color?: "blue" | "green" | "amber" | "red" | "neutral";
  children: ReactNode;
  className?: string;
};

const colors = {
  blue: "bg-brand-50 text-brand-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  neutral: "bg-neutral-100 text-neutral-600",
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
