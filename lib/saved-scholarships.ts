import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rowToScholarship,
  SCHOLARSHIP_SELECT,
  type ScholarshipJoinedRow,
} from "@/lib/scholarshipTransform";
import type { Scholarship } from "@/lib/types";

export async function isSaved(
  supabase: SupabaseClient,
  scholarshipId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("saved_scholarships")
    .select("scholarship_id")
    .eq("user_id", user.id)
    .eq("scholarship_id", scholarshipId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function listSaved(
  supabase: SupabaseClient,
  userId: string,
): Promise<Scholarship[]> {
  const { data, error } = await supabase
    .from("saved_scholarships")
    .select(`scholarship_id, created_at, scholarships ( ${SCHOLARSHIP_SELECT} )`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  type Joined = {
    scholarship_id: string;
    created_at: string;
    scholarships: ScholarshipJoinedRow | ScholarshipJoinedRow[] | null;
  };
  return ((data as unknown as Joined[] | null) ?? [])
    .map((row) => {
      const linked = Array.isArray(row.scholarships) ? row.scholarships[0] : row.scholarships;
      return linked ? rowToScholarship(linked) : null;
    })
    .filter((s): s is Scholarship => Boolean(s));
}

export async function listSavedIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("saved_scholarships")
    .select("scholarship_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.scholarship_id as string);
}

export async function setSaved(
  supabase: SupabaseClient,
  userId: string,
  scholarshipId: string,
  saved: boolean,
): Promise<void> {
  if (saved) {
    const { error } = await supabase
      .from("saved_scholarships")
      .upsert({ user_id: userId, scholarship_id: scholarshipId });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("saved_scholarships")
      .delete()
      .eq("user_id", userId)
      .eq("scholarship_id", scholarshipId);
    if (error) throw error;
  }
}
