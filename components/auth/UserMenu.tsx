"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

type UserMenuProps = {
  email: string | null | undefined;
  fullName: string | null | undefined;
  avatarUrl: string | null | undefined;
};

export function UserMenu({ email, fullName, avatarUrl }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const display = fullName || email || "Account";
  const initial = (fullName || email || "?").charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {initial}
          </span>
        )}
        <span className="hidden flex-1 truncate md:inline">{display}</span>
      </button>

      <div
        className={cn(
          "absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg",
          open ? "block" : "hidden",
        )}
      >
        <div className="border-b border-neutral-100 px-3 py-2 text-xs text-neutral-500">
          <span className="block truncate">{email}</span>
        </div>
        <form method="post" action="/auth/signout">
          <button
            type="submit"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>

    </div>
  );
}
