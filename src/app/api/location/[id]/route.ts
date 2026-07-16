import { NextRequest } from "next/server";
import { getLocationDetail } from "@/lib/db/read";
import { noStoreJson } from "@/lib/http/noStore";
import { requireAdvertiserAccess } from "@/lib/auth/scope";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const advertiserId = new URL(req.url).searchParams.get("advertiser_id");
  if (!advertiserId) return noStoreJson({ error: "advertiser_id required" }, { status: 400 });
  const scope = await requireAdvertiserAccess(req, advertiserId);
  if (!scope.ok) return noStoreJson({ error: "forbidden", reason: scope.reason }, { status: 403 });
  try {
    const detail = await getLocationDetail(advertiserId, params.id);
    if (!detail) return noStoreJson({ error: "not found" }, { status: 404 });
    return noStoreJson(detail);
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
