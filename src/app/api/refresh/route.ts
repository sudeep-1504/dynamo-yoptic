import { NextRequest, NextResponse } from "next/server";
import { ingestAll } from "@/lib/signals/ingest";
import { runCycle } from "@/lib/decision/pipeline";
import { isAuthorized } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// One-shot "make it live": ingest fresh signals (respecting the 15-min cache, so
// it's cheap and won't clobber a fresh injection) then run the identical decision
// pipeline, across every tenant. Used by the dashboard's auto-refresh and the
// "Fetch live weather" button so weather flows without waiting on the cron.
export async function POST(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  try {
    const force = new URL(req.url).searchParams.get("force") === "true";
    const ingest = await ingestAll(force);
    const decisions = await runCycle();
    return NextResponse.json({
      ran_at: new Date().toISOString(),
      ingest,
      decisions: decisions.map((d) => ({
        location: d.location_name,
        creative: d.result.winner_creative_name,
        source: d.result.decision_source,
        why: d.result.why,
      })),
      changes: decisions.filter((d) => d.result.state_changed).length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
