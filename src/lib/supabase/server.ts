import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Service-role client for the decision pipeline write path. Bypasses RLS, so it
// is used ONLY in server-side code (API routes / cron), never shipped to the browser.
// The append-only guarantee on `transitions` is enforced by a DB trigger, so even
// this privileged client cannot UPDATE/DELETE the audit log.
let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

export function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
