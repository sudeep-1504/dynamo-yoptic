import { NextRequest } from "next/server";
import { getLocationDetail } from "@/lib/db/read";
import { noStoreJson } from "@/lib/http/noStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const detail = await getLocationDetail(params.id);
    if (!detail) return noStoreJson({ error: "not found" }, { status: 404 });
    return noStoreJson(detail);
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
