import { redirect } from "next/navigation";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewCounselorChatPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/counselor/new");

  return <ChatWindow />;
}
