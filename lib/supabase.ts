import { createClient } from "@supabase/supabase-js";
import { getAnonKey, getSupabaseUrl } from "./supabase/env";

export { createServiceClient } from "./supabase/service";

/**
 * Anon-key Supabase client without cookie/session handling.
 * Safe to use server-side for public reads (RLS-enforced public tables).
 * For client-side cookie-aware auth, import `createBrowserClient` from `@/lib/supabase/client` instead.
 */
export function createBrowserClient() {
  return createClient(getSupabaseUrl(), getAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
