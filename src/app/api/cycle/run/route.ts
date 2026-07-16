import { NextRequest, NextResponse } from "next/server";
import { runCycle } from "@/lib/decision/pipeline";
import { isAuthorized } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// Manual "run cycle now" — the SAME pipeline the scheduled loop uses. Drives the
// walkthrough. Runs the decision on current cached/injected readings (does NOT
// fetch, so an injected condition isn't clobbered before you see the result).
export async function POST(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const decisions = await runCycle();
    return NextResponse.json({
      ran_at: new Date().toISOString(),
      decisions: decisions.map((d) => ({
        location: d.location_name,
        creative: d.result.winner_creative_name,
        source: d.result.decision_source,
        why: d.result.why,
        state_changed: d.result.state_changed,
        dwell_suppressed: d.result.dwell_suppressed,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
