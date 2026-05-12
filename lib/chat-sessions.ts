import type { SupabaseClient } from "@supabase/supabase-js";

export type StoredChatMessage = { role: "user" | "assistant"; content: string };

export type StoredChatSession = {
  id: string;
  user_id: string;
  title: string | null;
  messages: StoredChatMessage[];
  profile: unknown;
  shortlist_ids: string[] | null;
  recommendations: unknown;
  created_at: string;
  updated_at: string;
};

function deriveTitle(messages: StoredChatMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === "user")?.content?.trim();
  if (!firstUser) return null;
  return firstUser.length > 80 ? `${firstUser.slice(0, 77)}…` : firstUser;
}

export async function createSession(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

export async function getSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<StoredChatSession | null> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return (data as StoredChatSession | null) ?? null;
}

export async function listUserSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<StoredChatSession[]> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StoredChatSession[];
}

export async function persistTurn(
  supabase: SupabaseClient,
  sessionId: string,
  args: {
    messages: StoredChatMessage[];
    profile: unknown;
    shortlistIds: string[];
    recommendations: unknown;
  },
): Promise<void> {
  const title = deriveTitle(args.messages);
  const { error } = await supabase
    .from("chat_sessions")
    .update({
      messages: args.messages,
      profile: args.profile,
      shortlist_ids: args.shortlistIds,
      recommendations: args.recommendations,
      title,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function deleteSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase.from("chat_sessions").delete().eq("id", sessionId);
  if (error) throw error;
}
