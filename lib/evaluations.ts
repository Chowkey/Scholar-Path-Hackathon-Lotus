import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvaluationResult, ProfileFormData } from "@/lib/types";

export type StoredEvaluation = {
  id: string;
  user_id: string;
  profile: ProfileFormData;
  scholarship_ids: string[];
  results: EvaluationResult[];
  created_at: string;
};

export async function saveEvaluation(
  supabase: SupabaseClient,
  userId: string,
  args: {
    profile: ProfileFormData;
    scholarshipIds: string[];
    results: EvaluationResult[];
  },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("evaluations")
    .insert({
      user_id: userId,
      profile: args.profile,
      scholarship_ids: args.scholarshipIds,
      results: args.results,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

export async function listUserEvaluations(
  supabase: SupabaseClient,
  userId: string,
): Promise<StoredEvaluation[]> {
  const { data, error } = await supabase
    .from("evaluations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StoredEvaluation[];
}

export async function getEvaluation(
  supabase: SupabaseClient,
  evaluationId: string,
): Promise<StoredEvaluation | null> {
  const { data, error } = await supabase
    .from("evaluations")
    .select("*")
    .eq("id", evaluationId)
    .maybeSingle();
  if (error) throw error;
  return (data as StoredEvaluation | null) ?? null;
}
