// Read models for the dashboard. Where we need a live "why"/status, we re-run the
// PURE engine read-only (no apply) so the displayed reason always matches what a
// cycle would decide right now — not a possibly-stale last transition.

import { supabaseAdmin } from "@/lib/supabase/server";
import { decide } from "@/lib/decision/engine";
import { DecisionResult, SnapshotEntry } from "@/lib/decision/types";
import {
  getActiveOverride,
  getBindingOverrides,
  getBindings,
  getCampaignByAdvertiserId,
  getCurrentState,
  getLocationsForCampaign,
  getSignalTypeMap,
  getSnapshot,
  withLocationOverrides,
} from "./repo";

export type StatusChip = "Auto" | "Fallback" | "Override" | "Paused";

export interface LocationCard {
  location_id: string;
  location_name: string;
  current_creative: string | null; // actually-applied creative (line_items)
  status: StatusChip;
  why: string;
  signal_snapshot: SnapshotEntry[];
  data_age_minutes: number | null;
  staleness_flag: boolean;
  dwell_suppressed: boolean;
  rule_fired: DecisionResult["rule_fired"];
}

export interface PortfolioView {
  advertiser_id: string;
  campaign_id: string;
  campaign_name: string;
  advertiser_name: string;
  dwell_minutes: number;
  counts: { auto: number; fallback: number; override: number; paused: number };
  locations: LocationCard[];
  weather_enabled: boolean;
}

const TOLERANCE = 15;

function statusOf(result: DecisionResult): StatusChip {
  if (result.decision_source === "override") {
    return result.is_paused ? "Paused" : "Override";
  }
  if (result.decision_source === "fallback") return "Fallback";
  return "Auto";
}

function maxAge(snapshot: SnapshotEntry[]): number | null {
  const ages = snapshot
    .map((s) => s.age_minutes)
    .filter((a): a is number => a != null);
  if (ages.length === 0) return null;
  return Math.max(...ages);
}

export async function buildPortfolio(advertiserId: string): Promise<PortfolioView | null> {
  const campaign = await getCampaignByAdvertiserId(advertiserId);
  if (!campaign) return null;
  const [bindings, bindingOverrides, locations, sig] = await Promise.all([
    getBindings(campaign.campaign_id),
    getBindingOverrides(campaign.campaign_id),
    getLocationsForCampaign(campaign.campaign_id),
    getSignalTypeMap(),
  ]);

  const cards: LocationCard[] = [];
  const counts = { auto: 0, fallback: 0, override: 0, paused: 0 };

  for (const loc of locations) {
    const [snapshot, current, override] = await Promise.all([
      getSnapshot(loc.id, sig.byId),
      getCurrentState(loc.id, campaign.campaign_id),
      getActiveOverride(loc.id, campaign.campaign_id),
    ]);

    const effectiveBindings = withLocationOverrides(bindings, bindingOverrides, loc.id);

    const result = decide({
      location_id: loc.id,
      campaign_id: campaign.campaign_id,
      bindings: effectiveBindings,
      snapshot,
      current_creative_id: current.current_creative_id,
      last_state_change_at: current.last_state_change_at,
      override,
      config: {
        now: new Date().toISOString(),
        staleness_tolerance_minutes: TOLERANCE,
        dwell_minutes: campaign.dwell_minutes,
      },
    });

    // The applied creative is whatever line_items currently say (may differ from
    // the fresh winner while dwell holds). Look it up by name.
    const currentName = current.current_creative_id
      ? bindings.find((b) => b.creative_id === current.current_creative_id)
          ?.creative_name ?? null
      : null;

    const status = statusOf(result);
    counts[status.toLowerCase() as keyof typeof counts]++;

    cards.push({
      location_id: loc.id,
      location_name: loc.name,
      current_creative: status === "Paused" ? null : currentName,
      status,
      why: result.why,
      signal_snapshot: result.signal_snapshot,
      data_age_minutes: maxAge(result.signal_snapshot),
      staleness_flag: result.staleness_flag,
      dwell_suppressed: result.dwell_suppressed,
      rule_fired: result.rule_fired,
    });
  }

  return {
    advertiser_id: campaign.advertiser_id,
    campaign_id: campaign.campaign_id,
    campaign_name: campaign.campaign_name,
    advertiser_name: campaign.advertiser_name,
    dwell_minutes: campaign.dwell_minutes,
    counts,
    locations: cards,
    weather_enabled: Boolean(process.env.WEATHERAPI_KEY),
  };
}

export interface TransitionRow {
  id: string;
  created_at: string;
  location_id: string;
  location_name: string;
  from_creative: string | null;
  to_creative: string | null;
  decision_source: string;
  trigger_type: string | null;
  rule_fired_name: string | null;
  rule_fired_priority: number | null;
  signal_snapshot: SnapshotEntry[];
  staleness_flag: boolean;
  dwell_suppressed: boolean;
  state_changed: boolean;
}

export interface HistoryFilter {
  campaignId: string;
  locationId?: string;
  source?: string;
  limit?: number;
}

export async function getHistory(filter: HistoryFilter): Promise<TransitionRow[]> {
  const db = supabaseAdmin();
  let q = db
    .from("transitions")
    .select(
      "id, created_at, location_id, decision_source, trigger_type, rule_fired_name, rule_fired_priority, signal_snapshot, staleness_flag, dwell_suppressed, state_changed, from_creative_id, to_creative_id, locations(name), fc:creatives!transitions_from_creative_id_fkey(name), tc:creatives!transitions_to_creative_id_fkey(name)"
    )
    .eq("campaign_id", filter.campaignId)
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 50);
  if (filter.locationId) q = q.eq("location_id", filter.locationId);
  if (filter.source) q = q.eq("decision_source", filter.source);
  const { data, error } = await q;
  if (error) throw error;
  return (data as any[]).map((t) => ({
    id: t.id,
    created_at: t.created_at,
    location_id: t.location_id,
    location_name: t.locations?.name ?? "",
    from_creative: t.fc?.name ?? null,
    to_creative: t.tc?.name ?? null,
    decision_source: t.decision_source,
    trigger_type: t.trigger_type,
    rule_fired_name: t.rule_fired_name,
    rule_fired_priority: t.rule_fired_priority,
    signal_snapshot: t.signal_snapshot,
    staleness_flag: t.staleness_flag,
    dwell_suppressed: t.dwell_suppressed,
    state_changed: t.state_changed,
  }));
}

export interface ActiveOverrideRow {
  id: string;
  location_id: string | null;
  location_name: string | null;
  campaign_id: string | null;
  forced_creative_id: string | null;
  forced_creative_name: string | null;
  is_paused: boolean;
  actor: string;
  created_at: string;
  expires_at: string | null;
}

export async function getActiveOverrides(campaignId: string): Promise<ActiveOverrideRow[]> {
  const db = supabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("overrides")
    .select(
      "id, location_id, campaign_id, forced_creative_id, is_paused, actor, created_at, expires_at, locations(name), creatives(name)"
    )
    .eq("campaign_id", campaignId)
    .is("released_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any[])
    .filter((o) => !o.expires_at || o.expires_at > nowIso)
    .map((o) => ({
      id: o.id,
      location_id: o.location_id,
      location_name: o.locations?.name ?? null,
      campaign_id: o.campaign_id,
      forced_creative_id: o.forced_creative_id,
      forced_creative_name: o.creatives?.name ?? null,
      is_paused: o.is_paused,
      actor: o.actor,
      created_at: o.created_at,
      expires_at: o.expires_at,
    }));
}

export interface LocationDetail extends LocationCard {
  creatives: { id: string; name: string; role: string }[];
  transitions: TransitionRow[];
  next_decision_seconds: number | null;
}

export async function getLocationDetail(
  advertiserId: string,
  locationId: string
): Promise<LocationDetail | null> {
  const portfolio = await buildPortfolio(advertiserId);
  if (!portfolio) return null;
  const card = portfolio.locations.find((l) => l.location_id === locationId);
  if (!card) return null;
  const bindings = await getBindings(portfolio.campaign_id);
  const transitions = await getHistory({ campaignId: portfolio.campaign_id, locationId, limit: 30 });
  return {
    ...card,
    creatives: bindings.map((b) => ({
      id: b.creative_id,
      name: b.creative_name,
      role: b.creative_role,
    })),
    transitions,
    next_decision_seconds: null,
  };
}
