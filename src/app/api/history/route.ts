import { NextRequest } from "next/server";
import { getHistory } from "@/lib/db/read";
import { noStoreJson } from "@/lib/http/noStore";
import { requireCampaignAccess } from "@/lib/auth/scope";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Filterable transition log (by location, source), scoped to one campaign.
// Suppressed dwell flips included.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign_id");
  if (!campaignId) return noStoreJson({ error: "campaign_id required" }, { status: 400 });
  const scope = await requireCampaignAccess(req, campaignId);
  if (!scope.ok) return noStoreJson({ error: "forbidden", reason: scope.reason }, { status: 403 });

  const locationId = url.searchParams.get("location_id") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 50);
  try {
    const rows = await getHistory({ campaignId, locationId, source, limit });
    return noStoreJson({ transitions: rows });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
