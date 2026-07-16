import { NextRequest, NextResponse } from "next/server";
import { ingestAll } from "@/lib/signals/ingest";
import { runCycle } from "@/lib/decision/pipeline";
import { isAuthorized } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// One-shot "make it live": ingest fresh signals (respecting the 15-min cache, so
// it's cheap and won't clobber a fresh injection) then run the identical decision
// pipeline. Used by the dashboard's auto-refresh and the "Fetch live weather"
// button so weather flows without waiting on the daily cron.
export async function POST(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "true";
  try {
    const ingest = await ingestAll(force);
    const decisions = await runCycle();
    return NextResponse.json({
      ran_at: new Date().toISOString(),
      ingest,
      changes: decisions.filter((d) => d.result.state_changed).length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
