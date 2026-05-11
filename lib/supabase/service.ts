import { createClient, type SupabaseClientOptions } from "@supabase/supabase-js";
import { getServiceRoleKey, getSupabaseUrl } from "./env";

export function createServiceClient() {
  const options: SupabaseClientOptions<"public"> = {
    auth: { persistSession: false, autoRefreshToken: false },
  };

  // @supabase/realtime-js asserts a WebSocket transport at construction time
  // even when no subscription is opened. Next.js (and Node 22+) ship a native
  // WebSocket; older Node (incl. the project's tsx CLIs on Node 20) does not.
  // Lazily require `ws` only in that case so the Next.js bundle stays clean.
  if (typeof globalThis.WebSocket === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ws = require("ws") as unknown as typeof WebSocket;
    options.realtime = { transport: ws };
  }

  return createClient(getSupabaseUrl(), getServiceRoleKey(), options);
}
