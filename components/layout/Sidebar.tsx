"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, BookOpen, Compass, MessageCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Counselor", icon: MessageCircle },
  { href: "/scholarships", label: "Scholarships", icon: BookOpen },
  { href: "/evaluator", label: "Check My Fit", icon: BarChart2 },
  { href: "/alumni", label: "Alumni Match", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-16 flex-col border-r border-neutral-200 bg-white md:w-64">
      <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-5 md:px-6">
        <div className="rounded-2xl bg-brand-50 p-2 text-brand-600">
          <Compass className="h-5 w-5" />
        </div>
        <div className="hidden md:block">
          <p className="font-heading text-lg font-bold text-neutral-900">ScholarPath</p>
          <p className="text-xs text-neutral-400">Scholarship planning, simplified</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-5 md:px-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === href : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center justify-center rounded-xl px-3 py-3 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-800 md:justify-start md:gap-3",
                isActive && "border-r-2 border-brand-500 bg-brand-50 font-semibold text-brand-600",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden md:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="hidden p-4 md:block">
        <div className="rounded-xl border border-warm-100 bg-warm-50 p-3 text-sm text-neutral-600">
          Tip: Start with the Counselor to get personalized picks.
        </div>
      </div>
    </aside>
  );
}
