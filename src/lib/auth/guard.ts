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
export async function getSessionUser(): Promise<{ email: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const cookieStore = cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ? { email: user.email } : null;
}

// A mutation is authorized if it carries the cron secret OR a logged-in user.
export async function isAuthorized(req: NextRequest): Promise<{
  ok: boolean;
  actor: string | null;
}> {
  if (hasCronSecret(req)) return { ok: true, actor: "system" };
  const user = await getSessionUser();
  if (user) return { ok: true, actor: user.email };
  return { ok: false, actor: null };
}
