import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { noStoreJson } from "@/lib/http/noStore";
import { requireAdvertiserWrite } from "@/lib/auth/scope";

export const dynamic = "force-dynamic";

// Release an override back to auto (logged as a handover via released_at). Body:
//   { override_id }
export async function POST(req: NextRequest) {
  try {
    const { override_id } = await req.json();
    if (!override_id) return noStoreJson({ error: "override_id required" }, { status: 400 });

    const db = supabaseAdmin();
    // Look up which advertiser this override belongs to, to enforce the same
    // tenant boundary as every other write (a client user may only release
    // their own overrides).
    const { data: ov, error: findErr } = await db
      .from("overrides")
      .select("id, campaigns(advertiser_id)")
      .eq("id", override_id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!ov) return noStoreJson({ error: "not found" }, { status: 404 });

    const advertiserId = (ov as any).campaigns?.advertiser_id;
    const scope = await requireAdvertiserWrite(req, advertiserId);
    if (!scope.ok) return noStoreJson({ error: "forbidden", reason: scope.reason }, { status: 403 });

    const { error } = await db
      .from("overrides")
      .update({ released_at: new Date().toISOString() })
      .eq("id", override_id)
      .is("released_at", null);
    if (error) throw error;
    return noStoreJson({ ok: true });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
