"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
};

export function Select({ value, onChange, options }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-between rounded-xl border-2 border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 shadow-sm outline-none transition-all",
          isOpen
            ? "border-brand-500 ring-4 ring-brand-100/50"
            : "hover:border-brand-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100/50"
        )}
      >
        <span className="truncate">{value}</span>
        <ChevronDown
          className={cn("ml-2 h-4 w-4 shrink-0 transition-transform text-neutral-500", isOpen && "rotate-180")}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 max-h-60 w-full overflow-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-modal outline-none">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                value === option
                  ? "bg-brand-50 text-brand-700 font-semibold"
                  : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900",
              )}
            >
              <span className="truncate">{option}</span>
              {value === option && <Check className="ml-2 h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
