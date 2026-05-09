import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { listUserSessions } from "@/lib/chat-sessions";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CounselorPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/counselor");

  const sessions = await listUserSessions(supabase, user.id);

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-neutral-900">
              Your counselor chats
            </h1>
            <p className="mt-2 text-base text-neutral-600">
              Pick up a previous conversation or start a new one.
            </p>
          </div>
          <Link href="/counselor/new">
            <Button>
              <Plus className="h-4 w-4" /> New chat
            </Button>
          </Link>
        </header>

        {sessions.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center">
            <div className="mx-auto mb-4 w-fit rounded-2xl bg-brand-50 p-4 text-brand-600">
              <MessageCircle className="h-7 w-7" />
            </div>
            <h2 className="font-heading text-xl font-bold text-neutral-900">
              No chats yet
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              Start a conversation and your sessions will be saved here.
            </p>
            <Link href="/counselor/new" className="mt-5 inline-block">
              <Button>Start a chat</Button>
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/counselor/${session.id}`}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-neutral-900">
                      {session.title ?? "Untitled chat"}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {format(new Date(session.updated_at), "PPp")} ·{" "}
                      {(Array.isArray(session.messages) ? session.messages.length : 0)} messages
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
