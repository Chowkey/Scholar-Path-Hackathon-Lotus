import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import { getAnonKey, getSupabaseUrl } from "./env";

export function createBrowserClient() {
  return createSsrBrowserClient(getSupabaseUrl(), getAnonKey());
}
