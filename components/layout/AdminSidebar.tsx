"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, LayoutDashboard, Link2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/scholarships", label: "Scholarships", icon: Database },
  { href: "/admin/imports", label: "Source Imports", icon: Link2 },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-stone-200 bg-stone-950 text-stone-100">
      <div className="border-b border-white/10 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-amber-300/15 p-2 text-amber-300">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="font-heading text-lg font-bold">Admin Console</p>
            <p className="text-xs text-stone-400">Control ScholarPath data and quality</p>
          </div>
        </div>
      </div>

      <nav className="space-y-1 px-3 py-5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/admin" ? pathname === href : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-stone-300 transition hover:bg-white/5 hover:text-white",
                isActive && "bg-amber-300/10 font-semibold text-amber-200 ring-1 ring-amber-200/20",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto p-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-medium text-white">Public App</p>
          <p className="mt-1 text-xs leading-5 text-stone-400">
            Jump back to the student experience to verify content changes in context.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-900 transition hover:bg-amber-100"
          >
            Open ScholarPath
          </Link>
        </div>
      </div>
    </aside>
  );
}
