import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Consumer API for the downstream ad server (BE-15). Returns current eligible
// state per line item, ALWAYS paired with `state_effective_as_of` — the decision
// timestamp. Locked assumption: the ad server caches/lags rather than reading
// real-time, so it can judge staleness on its own side.
export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("line_items")
      .select(
        "id, state, bid, daily_budget, last_state_change_at, creatives(name), locations(name)"
      );
    if (error) throw error;
    const items = (data as any[]).map((li) => ({
      line_item_id: li.id,
      location: li.locations?.name,
      creative: li.creatives?.name,
      eligible: li.state === "active",
      bid: li.bid,
      daily_budget: li.daily_budget,
      state_effective_as_of: li.last_state_change_at,
    }));
    return NextResponse.json({
      served_at: new Date().toISOString(),
      note: "state_effective_as_of reflects the last decision; consumer should judge staleness on its own side",
      line_items: items,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
