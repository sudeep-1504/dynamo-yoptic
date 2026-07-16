import { NextRequest } from "next/server";
import { noStoreJson } from "@/lib/http/noStore";
import { requireAdvertiserAccess } from "@/lib/auth/scope";
import { listCampaignsForAdvertiser } from "@/lib/db/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Every campaign a tenant runs — feeds the campaign picker at /c/[advertiserId].
export async function GET(req: NextRequest) {
  const advertiserId = new URL(req.url).searchParams.get("advertiser_id");
  if (!advertiserId) return noStoreJson({ error: "advertiser_id required" }, { status: 400 });
  const scope = await requireAdvertiserAccess(req, advertiserId);
  if (!scope.ok) return noStoreJson({ error: "forbidden", reason: scope.reason }, { status: 403 });
  try {
    const campaigns = await listCampaignsForAdvertiser(advertiserId);
    return noStoreJson({ campaigns });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
