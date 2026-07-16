import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/auth/guard";
import { getActiveOverrides } from "@/lib/db/read";
import { noStoreJson } from "@/lib/http/noStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// List active overrides (for the persistent banner).
export async function GET() {
  try {
    const overrides = await getActiveOverrides();
    return noStoreJson({ overrides });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

// Set an override, scoped to a location. Body:
//   { location_id, forced_creative_id? , is_paused?, expires_at? }
// actor is taken from the authenticated user (or "system" for cron secret).
export async function POST(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  try {
    const body = await req.json();
    const { location_id, forced_creative_id, is_paused, expires_at } = body;
    if (!location_id) {
      return NextResponse.json({ error: "location_id required" }, { status: 400 });
    }
    if (!is_paused && !forced_creative_id) {
      return NextResponse.json(
        { error: "either is_paused or forced_creative_id required" },
        { status: 400 }
      );
    }
    const db = supabaseAdmin();
    // Release any existing active override on this location first (one at a time).
    await db
      .from("overrides")
      .update({ released_at: new Date().toISOString() })
      .eq("location_id", location_id)
      .is("released_at", null);

    const { data, error } = await db
      .from("overrides")
      .insert({
        location_id,
        forced_creative_id: is_paused ? null : forced_creative_id,
        is_paused: Boolean(is_paused),
        actor: auth.actor ?? "unknown",
        expires_at: expires_at ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, override: data });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
