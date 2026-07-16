import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getProfileById, Profile } from "./profile";

// Admin/cron endpoints accept a shared-secret bearer token (used by the Vercel
// cron and by curl during the walkthrough).
export function hasCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// The logged-in Supabase user for this request, from cookies. Throws a
// diagnostic message on failure (cookie count, GoTrue error) rather than
// silently returning null, so callers can surface *why* auth failed.
export async function getSessionUser(): Promise<{ id: string; email: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase public env vars not set");
  const cookieStore = cookies();
  const allCookies = cookieStore.getAll();
  const supabase = createServerClient(url, key, {
    cookies: { getAll: () => allCookies, setAll: () => {} },
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
  return { id: data.user.id, email: data.user.email };
}

// Session user + their profile (role, advertiser scope). Null if unauthenticated.
export async function getSessionProfile(): Promise<Profile | null> {
  try {
    const user = await getSessionUser();
    const profile = await getProfileById(user.id);
    return profile;
  } catch {
    return null;
  }
}

// A mutation is authorized if it carries the cron secret OR a logged-in user
// with a registered profile (invited-user allowlist, PRD P0-12). A logged-in
// auth.users row with NO profiles row is treated as unauthorized: profiles are
// created only by the admin invite flow, so a missing profile means this
// identity was never actually registered by the DynaMo team.
export async function isAuthorized(req: NextRequest): Promise<{
  ok: boolean;
  actor: string | null;
  profile?: Profile;
  reason?: string;
}> {
  if (hasCronSecret(req)) return { ok: true, actor: "system" };
  try {
    const user = await getSessionUser();
    const profile = await getProfileById(user.id);
    if (!profile) {
      return { ok: false, actor: null, reason: `${user.email} has no registered profile` };
    }
    return { ok: true, actor: profile.email, profile };
  } catch (e: any) {
    return { ok: false, actor: null, reason: String(e?.message ?? e) };
  }
}

// Internal-team-only actions (registering users). Cron secret also passes,
// for scripted bootstrapping.
export async function isInternalAdmin(req: NextRequest): Promise<{
  ok: boolean;
  actor: string | null;
  reason?: string;
}> {
  if (hasCronSecret(req)) return { ok: true, actor: "system" };
  const auth = await isAuthorized(req);
  if (!auth.ok) return auth;
  if (auth.profile?.role !== "internal" || !auth.profile.is_admin) {
    return { ok: false, actor: auth.actor, reason: "not an internal admin" };
  }
  return { ok: true, actor: auth.actor };
}
