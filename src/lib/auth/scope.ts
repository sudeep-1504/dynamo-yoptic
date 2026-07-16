import { NextRequest } from "next/server";
import { isAuthorized } from "./guard";
import { getCampaignById } from "@/lib/db/repo";

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

// Campaign-scoped variants: resolve campaign -> advertiser once, then apply
// the exact same rules as above. A client can run more than one campaign, so
// routes now key on campaign_id directly rather than assuming "the" campaign
// for an advertiser.
export async function requireCampaignAccess(
  req: NextRequest,
  campaignId: string
): Promise<{ ok: boolean; actor: string | null; reason?: string; advertiserId?: string }> {
  const campaign = await getCampaignById(campaignId);
  if (!campaign) return { ok: false, actor: null, reason: "campaign not found" };
  const scope = await requireAdvertiserAccess(req, campaign.advertiser_id);
  return { ...scope, advertiserId: campaign.advertiser_id };
}

export async function requireCampaignWrite(
  req: NextRequest,
  campaignId: string
): Promise<{ ok: boolean; actor: string | null; reason?: string; advertiserId?: string }> {
  const campaign = await getCampaignById(campaignId);
  if (!campaign) return { ok: false, actor: null, reason: "campaign not found" };
  const scope = await requireAdvertiserWrite(req, campaign.advertiser_id);
  return { ...scope, advertiserId: campaign.advertiser_id };
}
