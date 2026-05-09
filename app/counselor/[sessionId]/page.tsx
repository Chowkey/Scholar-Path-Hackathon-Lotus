import { notFound, redirect } from "next/navigation";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { getSession } from "@/lib/chat-sessions";
import { createServerClient } from "@/lib/supabase/server";
import type { Message } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CounselorSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/counselor/${sessionId}`);

  const session = await getSession(supabase, sessionId);
  if (!session) notFound();

  const initialMessages: Message[] = Array.isArray(session.messages)
    ? (session.messages as Message[])
    : [];

  return <ChatWindow initialMessages={initialMessages} initialSessionId={session.id} />;
}
