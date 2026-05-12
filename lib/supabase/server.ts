import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAnonKey, getSupabaseUrl } from "./env";

export async function createServerClient() {
  const cookieStore = await cookies();
  return createSsrServerClient(getSupabaseUrl(), getAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // setAll called from a Server Component — ignore; middleware refreshes the session.
        }
      },
    },
  });
}
