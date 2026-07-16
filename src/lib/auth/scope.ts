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
