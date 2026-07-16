import { NextRequest } from "next/server";
import { getHistory } from "@/lib/db/read";
import { getCampaignByAdvertiserId } from "@/lib/db/repo";
import { noStoreJson } from "@/lib/http/noStore";
import { requireAdvertiserAccess } from "@/lib/auth/scope";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Filterable transition log (by location, source), scoped to one tenant.
// Suppressed dwell flips included.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const advertiserId = url.searchParams.get("advertiser_id");
  if (!advertiserId) return noStoreJson({ error: "advertiser_id required" }, { status: 400 });
  const scope = await requireAdvertiserAccess(req, advertiserId);
  if (!scope.ok) return noStoreJson({ error: "forbidden", reason: scope.reason }, { status: 403 });

  const locationId = url.searchParams.get("location_id") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 50);
  try {
    const campaign = await getCampaignByAdvertiserId(advertiserId);
    if (!campaign) return noStoreJson({ transitions: [] });
    const rows = await getHistory({ campaignId: campaign.campaign_id, locationId, source, limit });
    return noStoreJson({ transitions: rows });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
