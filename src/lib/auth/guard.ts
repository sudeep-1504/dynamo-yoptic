import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Admin/cron endpoints accept a shared-secret bearer token (used by the Vercel
// cron and by curl during the walkthrough).
export function hasCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// Dashboard-facing mutations require a logged-in Supabase user (invited allowlist).
// Throws with a diagnostic message on failure so callers can surface *why* the
// session wasn't recognized, instead of a bare "unauthorized".
export async function getSessionUser(): Promise<{ email: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase public env vars not set");
  const cookieStore = cookies();
  const allCookies = cookieStore.getAll();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => allCookies,
      setAll: () => {},
    },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error(
      `getUser failed (${error.message}); request carried ${allCookies.length} cookie(s): [${allCookies.map((c) => c.name).join(", ")}]`
    );
  }
  if (!data.user?.email) {
    throw new Error(
      `no session user; request carried ${allCookies.length} cookie(s): [${allCookies.map((c) => c.name).join(", ")}]`
    );
  }
  return { email: data.user.email };
}

// Auth gate DISABLED for now (see middleware.ts) — mutations are open to anyone.
// A real session's email is still used for actor-attribution when present;
// otherwise the actor is recorded as "anonymous" rather than being blocked.
// Restore the PRD P0-12 invited-user requirement by removing the early return.
export async function isAuthorized(req: NextRequest): Promise<{
  ok: boolean;
  actor: string | null;
  reason?: string;
}> {
  if (hasCronSecret(req)) return { ok: true, actor: "system" };
  try {
    const user = await getSessionUser();
    if (user) return { ok: true, actor: user.email };
  } catch {
    // no valid session — fall through to anonymous access below
  }
  return { ok: true, actor: "anonymous" };
}
