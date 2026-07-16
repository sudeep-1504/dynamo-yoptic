import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getActiveOverrides } from "@/lib/db/read";
import { getCampaignByAdvertiserId } from "@/lib/db/repo";
import { noStoreJson } from "@/lib/http/noStore";
import { requireAdvertiserAccess, requireAdvertiserWrite } from "@/lib/auth/scope";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// List active overrides for one tenant (for the persistent banner).
export async function GET(req: NextRequest) {
  const advertiserId = new URL(req.url).searchParams.get("advertiser_id");
  if (!advertiserId) return noStoreJson({ error: "advertiser_id required" }, { status: 400 });
  const scope = await requireAdvertiserAccess(req, advertiserId);
  if (!scope.ok) return noStoreJson({ error: "forbidden", reason: scope.reason }, { status: 403 });
  try {
    const campaign = await getCampaignByAdvertiserId(advertiserId);
    if (!campaign) return noStoreJson({ overrides: [] });
    const overrides = await getActiveOverrides(campaign.campaign_id);
    return noStoreJson({ overrides });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

// Set an override, scoped to one tenant's campaign, optionally narrowed to a
// location. Body: { advertiser_id, location_id?, forced_creative_id?, is_paused?, expires_at? }
// actor is taken from the authenticated user (or "system" for cron secret).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { advertiser_id, location_id, forced_creative_id, is_paused, expires_at } = body;
    if (!advertiser_id) return noStoreJson({ error: "advertiser_id required" }, { status: 400 });
    const scope = await requireAdvertiserWrite(req, advertiser_id);
    if (!scope.ok) return noStoreJson({ error: "forbidden", reason: scope.reason }, { status: 403 });
    if (!is_paused && !forced_creative_id) {
      return noStoreJson(
        { error: "either is_paused or forced_creative_id required" },
        { status: 400 }
      );
    }
    const campaign = await getCampaignByAdvertiserId(advertiser_id);
    if (!campaign) return noStoreJson({ error: "no campaign for this advertiser" }, { status: 404 });

    const db = supabaseAdmin();
    // Release any existing active override at this scope first (one at a time).
    let releaseQuery = db
      .from("overrides")
      .update({ released_at: new Date().toISOString() })
      .eq("campaign_id", campaign.campaign_id)
      .is("released_at", null);
    releaseQuery = location_id
      ? releaseQuery.eq("location_id", location_id)
      : releaseQuery.is("location_id", null);
    await releaseQuery;

    const { data, error } = await db
      .from("overrides")
      .insert({
        campaign_id: campaign.campaign_id,
        location_id: location_id ?? null,
        forced_creative_id: is_paused ? null : forced_creative_id,
        is_paused: Boolean(is_paused),
        actor: scope.actor ?? "unknown",
        expires_at: expires_at ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return noStoreJson({ ok: true, override: data });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
