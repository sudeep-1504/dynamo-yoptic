import { NextRequest, NextResponse } from "next/server";
import { injectReading } from "@/lib/signals/ingest";
import { isAuthorized } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// Condition injection (P0-14): write a fake reading for a location to demo working
// and breaking on cue. Body: { location_id, precip_now?, apparent_temp?, temp_c?, fail? }
export async function POST(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  try {
    const body = await req.json();
    const { location_id, ...payload } = body;
    if (!location_id) {
      return NextResponse.json({ error: "location_id required" }, { status: 400 });
    }
    await injectReading(location_id, payload);
    return NextResponse.json({ ok: true, injected: payload });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
