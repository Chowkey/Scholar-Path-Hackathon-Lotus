import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  children: ReactNode;
};

const variantClasses = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 disabled:bg-brand-400",
  ghost: "text-neutral-600 hover:bg-neutral-100",
  outline:
    "border border-neutral-200 bg-white text-neutral-800 hover:border-brand-400 hover:text-brand-600",
};

const sizeClasses = {
  sm: "rounded-xl px-3 py-2 text-sm",
  md: "rounded-xl px-4 py-2.5 text-sm",
  lg: "rounded-xl px-5 py-3 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Spinner /> : null}
      <span>{children}</span>
    </button>
  );
}
