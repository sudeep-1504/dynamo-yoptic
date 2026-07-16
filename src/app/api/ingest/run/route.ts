import { NextRequest, NextResponse } from "next/server";
import { ingestAll } from "@/lib/signals/ingest";
import { isAuthorized } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// Fetch live signals for all locations (respects the 15-min cache unless force=true).
export async function POST(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "true";
  try {
    const results = await ingestAll(force);
    return NextResponse.json({ ingested_at: new Date().toISOString(), results });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
