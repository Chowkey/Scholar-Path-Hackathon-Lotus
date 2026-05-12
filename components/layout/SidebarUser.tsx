import Link from "next/link";
import { LogIn } from "lucide-react";
import { UserMenu } from "@/components/auth/UserMenu";
import { createServerClient } from "@/lib/supabase/server";

export async function SidebarUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:border-brand-400 hover:text-brand-600 md:justify-start"
      >
        <LogIn className="h-4 w-4 shrink-0" />
        <span className="hidden md:inline">Sign in</span>
      </Link>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,avatar_url,email")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <UserMenu
      email={profile?.email ?? user.email}
      fullName={profile?.full_name ?? null}
      avatarUrl={profile?.avatar_url ?? null}
    />
  );
}
