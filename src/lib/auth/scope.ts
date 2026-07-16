import { NextRequest } from "next/server";
import { isAuthorized } from "./guard";

// Can this request act on/read this advertiser's data? Internal team members
// see every tenant (client hidden behind a click); a client-role user is
// confined to their own advertiser_id — this is the actual tenant-isolation
// boundary (PRD BE-17), not just a UI convention.
export async function requireAdvertiserAccess(
  req: NextRequest,
  advertiserId: string
): Promise<{ ok: boolean; actor: string | null; reason?: string }> {
  const auth = await isAuthorized(req);
  if (!auth.ok) return auth;
  if (auth.actor === "system") return auth; // cron secret: full access
  if (auth.profile?.role === "internal") return auth;
  if (auth.profile?.role === "client" && auth.profile.advertiser_id === advertiserId) {
    return auth;
  }
  return { ok: false, actor: auth.actor, reason: "not scoped to this advertiser" };
}

// Can this request MUTATE this advertiser's data (force/pause a creative,
// inject a condition, release an override)? Every user type — internal or
// client — has an admin/normal distinction: normal users get read access
// (requireAdvertiserAccess above) but are view-only; only an admin (internal,
// across every client, or client, within their own advertiser) can act.
export async function requireAdvertiserWrite(
  req: NextRequest,
  advertiserId: string
): Promise<{ ok: boolean; actor: string | null; reason?: string }> {
  const auth = await isAuthorized(req);
  if (!auth.ok) return auth;
  if (auth.actor === "system") return auth; // cron secret: full access
  if (!auth.profile?.is_admin) {
    return { ok: false, actor: auth.actor, reason: "admin access required for this action" };
  }
  if (auth.profile.role === "internal") return auth;
  if (auth.profile.role === "client" && auth.profile.advertiser_id === advertiserId) {
    return auth;
  }
  return { ok: false, actor: auth.actor, reason: "not scoped to this advertiser" };
}
