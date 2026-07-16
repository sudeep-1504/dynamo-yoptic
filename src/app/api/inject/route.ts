import { NextRequest } from "next/server";
import { injectReading } from "@/lib/signals/ingest";
import { noStoreJson } from "@/lib/http/noStore";
import { requireCampaignWrite } from "@/lib/auth/scope";

export const dynamic = "force-dynamic";

// Condition injection (P0-14): write a fake reading for a location to demo working
// and breaking on cue. Signal readings are shared reference data across every
// tenant at that location (PRD BE-5) — campaign_id here is only an
// access-control check (this operator may act on their own dashboard), not a
// data partition; the injected reading is visible to any campaign at that
// location, matching how a real weather reading behaves.
// Body: { campaign_id, location_id, precip_now?, apparent_temp?, temp_c?, fail? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaign_id, location_id, ...payload } = body;
    if (!campaign_id) return noStoreJson({ error: "campaign_id required" }, { status: 400 });
    if (!location_id) return noStoreJson({ error: "location_id required" }, { status: 400 });
    const scope = await requireCampaignWrite(req, campaign_id);
    if (!scope.ok) return noStoreJson({ error: "forbidden", reason: scope.reason }, { status: 403 });

    await injectReading(location_id, payload);
    return noStoreJson({ ok: true, injected: payload });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
