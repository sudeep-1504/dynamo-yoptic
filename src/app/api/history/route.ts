import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/db/read";

export const dynamic = "force-dynamic";

// Filterable transition log (by location, source). Suppressed dwell flips included.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const locationId = url.searchParams.get("location_id") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 50);
  try {
    const rows = await getHistory({ locationId, source, limit });
    return NextResponse.json({ transitions: rows });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
