import { NextRequest, NextResponse } from "next/server";
import { ingestAll } from "@/lib/signals/ingest";
import { runCycle } from "@/lib/decision/pipeline";
import { hasCronSecret } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// Scheduled loop (Vercel Cron, 10-min cadence per vercel.json). Ingest fresh
// signals, then run the identical decision pipeline. Same code path as the manual
// trigger — this just chains ingest + cycle on a timer.
export async function GET(req: NextRequest) {
  if (!hasCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const ingest = await ingestAll(false);
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
