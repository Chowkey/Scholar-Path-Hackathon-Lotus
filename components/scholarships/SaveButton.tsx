"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/utils";

let cachedIds: Set<string> | null | undefined; // undefined = not loaded; null = not signed in
let cachedPromise: Promise<Set<string> | null> | null = null;

async function loadSavedIds(): Promise<Set<string> | null> {
  if (cachedIds !== undefined) return cachedIds;
  if (cachedPromise) return cachedPromise;
  cachedPromise = (async () => {
    const res = await fetch("/api/saved-scholarships", { cache: "no-store" });
    if (res.status === 401) {
      cachedIds = null;
      return null;
    }
    if (!res.ok) {
      cachedIds = new Set();
      return cachedIds;
    }
    const json = (await res.json()) as { ids: string[] };
    cachedIds = new Set(json.ids);
    return cachedIds;
  })();
  return cachedPromise;
}

export function SaveButton({ scholarshipId }: { scholarshipId: string }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    loadSavedIds().then((ids) => {
      if (!active) return;
      if (ids === null) {
        setSignedIn(false);
      } else {
        setSignedIn(true);
        setSaved(ids.has(scholarshipId));
      }
    });
    return () => {
      active = false;
    };
  }, [scholarshipId]);

  if (signedIn === false) return null;
  if (signedIn === null) return null;

  async function toggle(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    const next = !saved;
    setSaved(next);
    try {
      const res = await fetch("/api/saved-scholarships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scholarshipId, saved: next }),
      });
      if (!res.ok) throw new Error("failed");
      if (cachedIds && cachedIds !== null) {
        if (next) cachedIds.add(scholarshipId);
        else cachedIds.delete(scholarshipId);
      }
      window.dispatchEvent(
        new CustomEvent("scholarpath:saved-changed", {
          detail: { scholarshipId, saved: next },
        }),
      );
    } catch {
      setSaved(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save scholarship"}
      className={cn(
        "relative z-10 flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
        saved
          ? "border-brand-200 bg-brand-50 text-brand-600"
          : "border-neutral-200 bg-white text-neutral-500 hover:border-brand-300 hover:text-brand-600",
      )}
    >
      {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
    </button>
  );
}
