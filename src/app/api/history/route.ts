import { NextRequest } from "next/server";
import { getHistory } from "@/lib/db/read";
import { noStoreJson } from "@/lib/http/noStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Filterable transition log (by location, source). Suppressed dwell flips included.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const locationId = url.searchParams.get("location_id") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 50);
  try {
    const rows = await getHistory({ locationId, source, limit });
    return noStoreJson({ transitions: rows });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
