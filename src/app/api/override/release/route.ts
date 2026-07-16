import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// Release an override back to auto (logged as a handover via released_at). Body:
//   { override_id }
export async function POST(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  try {
    const { override_id } = await req.json();
    if (!override_id) {
      return NextResponse.json({ error: "override_id required" }, { status: 400 });
    }
    const db = supabaseAdmin();
    const { error } = await db
      .from("overrides")
      .update({ released_at: new Date().toISOString() })
      .eq("id", override_id)
      .is("released_at", null);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
