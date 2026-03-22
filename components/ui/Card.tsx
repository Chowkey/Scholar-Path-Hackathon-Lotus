import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  hoverable?: boolean;
};

export function Card({ className, hoverable = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-neutral-200 bg-white p-6 shadow-md transition-all duration-300",
        hoverable && "hover:border-brand-500 hover:shadow-xl hover:-translate-y-1 hover:bg-brand-50/10",
        className,
      )}
      {...props}
    />
  );
}
