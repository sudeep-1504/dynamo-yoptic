import { NextRequest } from "next/server";
import { noStoreJson } from "@/lib/http/noStore";
import { requireCampaignAccess, requireCampaignWrite } from "@/lib/auth/scope";
import {
  deleteBindingOverride,
  getBindingOverrides,
  getBindings,
  getLocationsForCampaign,
  updateBindingThreshold,
  upsertBindingOverride,
} from "@/lib/db/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Read the campaign-wide threshold for each context rule (rain, heat, ...),
// plus every per-location override currently set. Skips the always_true
// default binding — there's no number to threshold there.
export async function GET(req: NextRequest) {
  const campaignId = new URL(req.url).searchParams.get("campaign_id");
  if (!campaignId) return noStoreJson({ error: "campaign_id required" }, { status: 400 });
  const scope = await requireCampaignAccess(req, campaignId);
  if (!scope.ok) return noStoreJson({ error: "forbidden", reason: scope.reason }, { status: 403 });

  try {
    const [bindings, overrides, locations] = await Promise.all([
      getBindings(campaignId),
      getBindingOverrides(campaignId),
      getLocationsForCampaign(campaignId),
    ]);

    const thresholdBindings = bindings
      .filter((b) => b.predicate.type === "comparison")
      .map((b) => {
        const p = b.predicate as Extract<typeof b.predicate, { type: "comparison" }>;
        return {
          id: b.id,
          creative_name: b.creative_name,
          priority: b.priority,
          signal_type: p.signal_type,
          field: p.field,
          op: p.op,
          value: p.value,
          overrides: overrides
            .filter((o) => o.binding_id === b.id)
            .map((o) => ({
              location_id: o.location_id,
              location_name: o.location_name,
              value: (o.predicate as any).value,
            })),
        };
      });

    return noStoreJson({
      bindings: thresholdBindings,
      locations: locations.map((l) => ({ id: l.id, name: l.name })),
    });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

// Set a threshold. Body: { campaign_id, binding_id, value, location_id? }
// With location_id: sets/replaces that location's override.
// Without location_id: updates the campaign-wide default.
// Body: { campaign_id, binding_id, location_id, remove: true } removes an override.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaign_id, binding_id, value, location_id, remove } = body;
    if (!campaign_id || !binding_id) {
      return noStoreJson({ error: "campaign_id and binding_id required" }, { status: 400 });
    }
    const scope = await requireCampaignWrite(req, campaign_id);
    if (!scope.ok) return noStoreJson({ error: "forbidden", reason: scope.reason }, { status: 403 });

    if (remove) {
      if (!location_id) return noStoreJson({ error: "location_id required to remove an override" }, { status: 400 });
      await deleteBindingOverride(binding_id, location_id);
      return noStoreJson({ ok: true });
    }

    if (typeof value !== "number" || Number.isNaN(value)) {
      return noStoreJson({ error: "value must be a number" }, { status: 400 });
    }

    if (location_id) {
      await upsertBindingOverride(binding_id, location_id, value);
    } else {
      await updateBindingThreshold(binding_id, value);
    }
    return noStoreJson({ ok: true });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
