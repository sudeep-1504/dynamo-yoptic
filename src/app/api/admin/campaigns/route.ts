import { NextRequest } from "next/server";
import { noStoreJson } from "@/lib/http/noStore";
import { isAuthorized } from "@/lib/auth/guard";
import { requireAdvertiserWrite } from "@/lib/auth/scope";
import { createAdvertiser, createCampaign, seedCampaignRules } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

// Creates a campaign, seeded with the same rain > heat > default 3-tier
// pattern CoolSip uses (the only signal types the weather adapter currently
// populates) — a lightweight, opinionated setup rather than a generic
// rules/bindings editor (explicitly out of MVP scope). Either:
//   - adds a campaign to an EXISTING client (advertiser_id given): any admin
//     for that client, internal or the client's own, can do this.
//   - onboards a BRAND NEW client (new_advertiser_name given instead): an
//     internal admin only — onboarding a new customer is a DynaMo-team action.
// Body: {
//   advertiser_id?, new_advertiser_name?,
//   campaign_name, dwell_minutes?,
//   rain: { creative_name, threshold } | null,
//   heat: { creative_name, threshold } | null,
//   default_creative_name,
//   location_ids: string[]
// }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      advertiser_id,
      new_advertiser_name,
      campaign_name,
      dwell_minutes,
      rain,
      heat,
      default_creative_name,
      location_ids,
    } = body;

    if (!campaign_name || !default_creative_name) {
      return noStoreJson({ error: "campaign_name and default_creative_name are required" }, { status: 400 });
    }
    if (!Array.isArray(location_ids) || location_ids.length === 0) {
      return noStoreJson({ error: "at least one location must be selected" }, { status: 400 });
    }
    if (!rain && !heat) {
      return noStoreJson({ error: "at least one context rule (rain or heat) is required" }, { status: 400 });
    }
    if (!advertiser_id && !new_advertiser_name) {
      return noStoreJson({ error: "advertiser_id or new_advertiser_name is required" }, { status: 400 });
    }

    let resolvedAdvertiserId: string;
    if (advertiser_id) {
      const scope = await requireAdvertiserWrite(req, advertiser_id);
      if (!scope.ok) return noStoreJson({ error: "forbidden", reason: scope.reason }, { status: 403 });
      resolvedAdvertiserId = advertiser_id;
    } else {
      const auth = await isAuthorized(req);
      if (!auth.ok) return noStoreJson({ error: "unauthorized", reason: auth.reason }, { status: 401 });
      if (auth.actor !== "system" && (auth.profile?.role !== "internal" || !auth.profile.is_admin)) {
        return noStoreJson({ error: "forbidden", reason: "internal admins only can add a new client" }, { status: 403 });
      }
      const advertiser = await createAdvertiser(new_advertiser_name);
      resolvedAdvertiserId = advertiser.id;
    }

    const campaign = await createCampaign(resolvedAdvertiserId, campaign_name, dwell_minutes ?? 20);
    await seedCampaignRules(
      campaign.campaign_id,
      { rain: rain ?? null, heat: heat ?? null, defaultCreativeName: default_creative_name },
      location_ids
    );

    return noStoreJson({ ok: true, advertiser_id: resolvedAdvertiserId, campaign_id: campaign.campaign_id });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
