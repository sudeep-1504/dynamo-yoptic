import { supabaseAdmin } from "@/lib/supabase/server";
import {
  ActiveOverride,
  Binding,
  DecisionResult,
  SignalSnapshot,
} from "@/lib/decision/types";

export interface CampaignConfig {
  campaign_id: string;
  campaign_name: string;
  advertiser_id: string;
  advertiser_name: string;
  dwell_minutes: number;
}

export interface LocationRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

function toCampaignConfig(data: any): CampaignConfig {
  return {
    campaign_id: data.id,
    campaign_name: data.name,
    advertiser_id: data.advertiser_id,
    advertiser_name: data.advertisers?.name ?? "",
    dwell_minutes: data.dwell_minutes,
  };
}

// Every campaign across every tenant. The scheduled/manual decision loop
// iterates ALL of these (client-agnostic engine, per PRD Section 3/BE-19) —
// it never assumes there is only one advertiser.
export async function getAllCampaigns(): Promise<CampaignConfig[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("campaigns")
    .select("id, name, dwell_minutes, advertiser_id, advertisers(name)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as any[]).map(toCampaignConfig);
}

// One tenant's campaign, for a client-scoped dashboard view. Assumes one
// campaign per advertiser (true for the CoolSip MVP; a picker can be added
// per-advertiser later without changing this shape).
export async function getCampaignByAdvertiserId(
  advertiserId: string
): Promise<CampaignConfig | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("campaigns")
    .select("id, name, dwell_minutes, advertiser_id, advertisers(name)")
    .eq("advertiser_id", advertiserId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toCampaignConfig(data) : null;
}

export interface AdvertiserSummary {
  advertiser_id: string;
  advertiser_name: string;
  campaign_id: string | null;
  campaign_name: string | null;
}

// For the internal "Clients" picker — one card per tenant.
export async function listAdvertisers(): Promise<AdvertiserSummary[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("advertisers")
    .select("id, name, campaigns(id, name)")
    .order("name");
  if (error) throw error;
  return (data as any[]).map((a) => ({
    advertiser_id: a.id,
    advertiser_name: a.name,
    campaign_id: a.campaigns?.[0]?.id ?? null,
    campaign_name: a.campaigns?.[0]?.name ?? null,
  }));
}

export async function getLocations(): Promise<LocationRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("locations")
    .select("id, name, lat, lng")
    .order("name");
  if (error) throw error;
  return data as LocationRow[];
}

// Locations actually targeted by a campaign (has at least one line_item there).
// Locations are shared reference data across tenants (PRD BE-5/BE-17); a
// tenant's dashboard should only show the subset it actually runs in.
export async function getLocationsForCampaign(campaignId: string): Promise<LocationRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("line_items")
    .select("locations(id, name, lat, lng), creatives!inner(campaign_id)")
    .eq("creatives.campaign_id", campaignId);
  if (error) throw error;
  const seen = new Map<string, LocationRow>();
  for (const r of data as any[]) {
    const l = r.locations;
    if (l && !seen.has(l.id)) seen.set(l.id, l);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getBindings(campaignId: string): Promise<Binding[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("bindings")
    .select("creative_id, predicate, priority, trigger_type, creatives(name, role)")
    .eq("campaign_id", campaignId)
    .order("priority", { ascending: false });
  if (error) throw error;
  return (data as any[]).map((b) => ({
    creative_id: b.creative_id,
    creative_name: b.creatives?.name ?? "",
    creative_role: b.creatives?.role ?? "context",
    predicate: b.predicate,
    priority: b.priority,
    trigger_type: b.trigger_type,
  }));
}

// signal_type name -> id, and id -> name.
export async function getSignalTypeMap(): Promise<{
  byName: Record<string, string>;
  byId: Record<string, string>;
}> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("signal_types").select("id, name");
  if (error) throw error;
  const byName: Record<string, string> = {};
  const byId: Record<string, string> = {};
  for (const r of data as any[]) {
    byName[r.name] = r.id;
    byId[r.id] = r.name;
  }
  return { byName, byId };
}

// Latest reading per signal_type for a location -> SignalSnapshot.
export async function getSnapshot(
  locationId: string,
  idToName: Record<string, string>
): Promise<SignalSnapshot> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("signal_readings")
    .select("signal_type_id, value, read_at, provider, fetch_status")
    .eq("location_id", locationId)
    .order("read_at", { ascending: false });
  if (error) throw error;

  const snapshot: SignalSnapshot = {};
  for (const r of data as any[]) {
    const name = idToName[r.signal_type_id];
    if (!name) continue;
    if (snapshot[name]) continue; // keep only the newest per signal_type
    snapshot[name] = {
      signal_type: name,
      value: r.value,
      read_at: r.read_at,
      provider: r.provider,
      fetch_status: r.fetch_status,
    };
  }
  return snapshot;
}

// Current active creative + when state last changed, for a location, scoped to
// one campaign's own creatives — a shared location can carry line_items from
// multiple tenants' campaigns, and must never read/write across that boundary.
export async function getCurrentState(
  locationId: string,
  campaignId: string
): Promise<{
  current_creative_id: string | null;
  last_state_change_at: string;
}> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("line_items")
    .select("creative_id, state, last_state_change_at, creatives!inner(campaign_id)")
    .eq("location_id", locationId)
    .eq("creatives.campaign_id", campaignId);
  if (error) throw error;
  const active = (data as any[]).find((li) => li.state === "active");
  // last_state_change_at: newest across the location's line items.
  const latest = (data as any[])
    .map((li) => li.last_state_change_at)
    .sort()
    .reverse()[0];
  return {
    current_creative_id: active?.creative_id ?? null,
    last_state_change_at: active?.last_state_change_at ?? latest ?? new Date(0).toISOString(),
  };
}

// Overrides are always scoped to one campaign (campaign_id required on
// insert), optionally narrowed to one location. A location can be shared by
// multiple tenants' campaigns, so "campaign_id = X, location_id = null" (a
// campaign-wide override) vs "campaign_id = X, location_id = Y" (one location
// within that campaign) is the only unambiguous way to resolve which tenant's
// line items an override actually applies to.
export async function getActiveOverride(
  locationId: string,
  campaignId: string
): Promise<ActiveOverride | null> {
  const db = supabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("overrides")
    .select("is_paused, forced_creative_id, actor, created_at, expires_at, released_at, location_id, campaign_id")
    .eq("campaign_id", campaignId)
    .is("released_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data as any[]).filter(
    (o) => !o.expires_at || o.expires_at > nowIso
  );
  // Location-scoped override (this campaign) wins over a campaign-wide one.
  const loc = rows.find((o) => o.location_id === locationId);
  const camp = rows.find((o) => o.location_id === null);
  const o = loc ?? camp;
  if (!o) return null;
  return {
    is_paused: o.is_paused,
    forced_creative_id: o.forced_creative_id,
    actor: o.actor,
    created_at: o.created_at,
    expires_at: o.expires_at,
  };
}

// Apply the decision: set winner active, all others (within this campaign, at
// this location) paused. Scoped by campaignId for the same shared-location
// reason as getCurrentState above.
export async function applyState(
  locationId: string,
  campaignId: string,
  winnerCreativeId: string | null,
  stateChanged: boolean
): Promise<void> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("line_items")
    .select("id, creative_id, state, creatives!inner(campaign_id)")
    .eq("location_id", locationId)
    .eq("creatives.campaign_id", campaignId);
  if (error) throw error;

  const nowIso = new Date().toISOString();
  for (const li of data as any[]) {
    const shouldBeActive = li.creative_id === winnerCreativeId;
    const nextState = shouldBeActive ? "active" : "paused";
    if (nextState !== li.state) {
      const { error: uErr } = await db
        .from("line_items")
        .update({ state: nextState, last_state_change_at: nowIso })
        .eq("id", li.id);
      if (uErr) throw uErr;
    }
  }
}

// Append an immutable transition row from the decision result.
export async function logTransition(
  locationId: string,
  campaignId: string,
  result: DecisionResult
): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("transitions").insert({
    location_id: locationId,
    campaign_id: campaignId,
    from_creative_id: result.from_creative_id,
    to_creative_id: result.winner_creative_id,
    decision_source: result.decision_source,
    trigger_type: result.trigger_type,
    rule_fired_name: result.rule_fired?.name ?? null,
    rule_fired_priority: result.rule_fired?.priority ?? null,
    signal_snapshot: result.signal_snapshot,
    staleness_flag: result.staleness_flag,
    dwell_suppressed: result.dwell_suppressed,
    state_changed: result.state_changed,
  });
  if (error) throw error;
}
