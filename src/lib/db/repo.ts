import { supabaseAdmin } from "@/lib/supabase/server";
import {
  ActiveOverride,
  Binding,
  DecisionResult,
  Predicate,
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

// One campaign, looked up directly by id — the actual scoping unit for a
// dashboard now that a client can run more than one campaign.
export async function getCampaignById(campaignId: string): Promise<CampaignConfig | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("campaigns")
    .select("id, name, dwell_minutes, advertiser_id, advertisers(name)")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw error;
  return data ? toCampaignConfig(data) : null;
}

// Every campaign a tenant runs — the "campaign picker" a client lands on
// after picking (or being scoped to) an advertiser.
export async function listCampaignsForAdvertiser(advertiserId: string): Promise<CampaignConfig[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("campaigns")
    .select("id, name, dwell_minutes, advertiser_id, advertisers(name)")
    .eq("advertiser_id", advertiserId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as any[]).map(toCampaignConfig);
}

export interface AdvertiserSummary {
  advertiser_id: string;
  advertiser_name: string;
  campaign_count: number;
}

// For the internal "Clients" picker — one card per tenant.
export async function listAdvertisers(): Promise<AdvertiserSummary[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("advertisers")
    .select("id, name, campaigns(id)")
    .order("name");
  if (error) throw error;
  return (data as any[]).map((a) => ({
    advertiser_id: a.id,
    advertiser_name: a.name,
    campaign_count: a.campaigns?.length ?? 0,
  }));
}

// Onboard a brand-new tenant. Internal-admin action (see /api/admin/campaigns).
export async function createAdvertiser(name: string): Promise<{ id: string; name: string }> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("advertisers").insert({ name }).select("id, name").single();
  if (error) throw error;
  return data;
}

// A new campaign under an existing (or just-created) advertiser. Empty of
// creatives/bindings/line_items until seedCampaignRules populates it.
export async function createCampaign(
  advertiserId: string,
  name: string,
  dwellMinutes = 20
): Promise<CampaignConfig> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("campaigns")
    .insert({ advertiser_id: advertiserId, name, dwell_minutes: dwellMinutes })
    .select("id, name, dwell_minutes, advertiser_id, advertisers(name)")
    .single();
  if (error) throw error;
  return toCampaignConfig(data);
}

export interface SeedRuleSpec {
  creative_name: string;
  threshold: number;
}

// Seeds the same rain > heat > default 3-tier pattern CoolSip uses (the only
// signal types the WeatherAPI adapter currently populates), for a brand-new
// campaign: creatives, their bindings, and one line_item per selected
// location per creative (default starts active — the guaranteed floor,
// PRD LOGIC-2). Rain outranks heat outranks default, matching the locked
// CoolSip precedence (Section 5.3) — every new campaign starts from the same
// proven ordering rather than an arbitrary one.
export async function seedCampaignRules(
  campaignId: string,
  spec: {
    rain: SeedRuleSpec | null;
    heat: SeedRuleSpec | null;
    defaultCreativeName: string;
  },
  locationIds: string[]
): Promise<void> {
  const db = supabaseAdmin();
  const creativeIdsAndPriorities: { creative_id: string; priority: number }[] = [];

  if (spec.rain) {
    const { data: c, error } = await db
      .from("creatives")
      .insert({ campaign_id: campaignId, name: spec.rain.creative_name, role: "context" })
      .select("id")
      .single();
    if (error) throw error;
    await db.from("bindings").insert({
      campaign_id: campaignId,
      creative_id: c.id,
      priority: 100,
      trigger_type: "weather.precip",
      predicate: {
        type: "comparison",
        signal_type: "weather.precip",
        field: "precip_now",
        op: ">",
        value: spec.rain.threshold,
      },
    });
    creativeIdsAndPriorities.push({ creative_id: c.id, priority: 100 });
  }

  if (spec.heat) {
    const { data: c, error } = await db
      .from("creatives")
      .insert({ campaign_id: campaignId, name: spec.heat.creative_name, role: "context" })
      .select("id")
      .single();
    if (error) throw error;
    await db.from("bindings").insert({
      campaign_id: campaignId,
      creative_id: c.id,
      priority: 50,
      trigger_type: "weather.temp",
      predicate: {
        type: "comparison",
        signal_type: "weather.temp",
        field: "apparent_temp",
        op: ">=",
        value: spec.heat.threshold,
      },
    });
    creativeIdsAndPriorities.push({ creative_id: c.id, priority: 50 });
  }

  const { data: defC, error: defErr } = await db
    .from("creatives")
    .insert({ campaign_id: campaignId, name: spec.defaultCreativeName, role: "default" })
    .select("id")
    .single();
  if (defErr) throw defErr;
  await db.from("bindings").insert({
    campaign_id: campaignId,
    creative_id: defC.id,
    priority: 0,
    trigger_type: "default",
    predicate: { type: "always_true" },
  });
  creativeIdsAndPriorities.push({ creative_id: defC.id, priority: 0 });

  const lineItems = locationIds.flatMap((locationId) =>
    creativeIdsAndPriorities.map(({ creative_id, priority }) => ({
      creative_id,
      location_id: locationId,
      state: priority === 0 ? "active" : "paused",
    }))
  );
  if (lineItems.length > 0) {
    const { error: liErr } = await db.from("line_items").insert(lineItems);
    if (liErr) throw liErr;
  }
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
    .select("id, creative_id, predicate, priority, trigger_type, creatives(name, role)")
    .eq("campaign_id", campaignId)
    .order("priority", { ascending: false });
  if (error) throw error;
  return (data as any[]).map((b) => ({
    id: b.id,
    creative_id: b.creative_id,
    creative_name: b.creatives?.name ?? "",
    creative_role: b.creatives?.role ?? "context",
    predicate: b.predicate,
    priority: b.priority,
    trigger_type: b.trigger_type,
  }));
}

export interface BindingOverride {
  binding_id: string;
  location_id: string;
  location_name: string;
  predicate: Predicate;
}

// Every per-location override for a campaign's bindings, in one query — kept
// small (a handful of rows at most) and merged in-memory per location rather
// than re-queried per location.
export async function getBindingOverrides(campaignId: string): Promise<BindingOverride[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("binding_overrides")
    .select("binding_id, location_id, predicate, locations(name), bindings!inner(campaign_id)")
    .eq("bindings.campaign_id", campaignId);
  if (error) throw error;
  return (data as any[]).map((o) => ({
    binding_id: o.binding_id,
    location_id: o.location_id,
    location_name: o.locations?.name ?? "",
    predicate: o.predicate,
  }));
}

// Pure merge: the campaign-wide bindings, with any matching per-location
// override's predicate substituted in. The engine itself never knows the
// difference — it just receives whichever Binding[] this produced.
export function withLocationOverrides(
  bindings: Binding[],
  overrides: BindingOverride[],
  locationId: string
): Binding[] {
  return bindings.map((b) => {
    const ov = overrides.find((o) => o.binding_id === b.id && o.location_id === locationId);
    return ov ? { ...b, predicate: ov.predicate } : b;
  });
}

// Update a binding's campaign-wide (default) threshold value.
export async function updateBindingThreshold(bindingId: string, value: number): Promise<void> {
  const db = supabaseAdmin();
  const { data: existing, error: findErr } = await db
    .from("bindings")
    .select("predicate")
    .eq("id", bindingId)
    .single();
  if (findErr) throw findErr;
  const predicate = { ...(existing.predicate as any), value };
  const { error } = await db.from("bindings").update({ predicate }).eq("id", bindingId);
  if (error) throw error;
}

// Set (or replace) a per-location override for one binding.
export async function upsertBindingOverride(
  bindingId: string,
  locationId: string,
  value: number
): Promise<void> {
  const db = supabaseAdmin();
  const { data: base, error: findErr } = await db
    .from("bindings")
    .select("predicate")
    .eq("id", bindingId)
    .single();
  if (findErr) throw findErr;
  const predicate = { ...(base.predicate as any), value };
  const { error } = await db
    .from("binding_overrides")
    .upsert({ binding_id: bindingId, location_id: locationId, predicate }, { onConflict: "binding_id,location_id" });
  if (error) throw error;
}

// Remove a location's override, reverting it to the campaign-wide default.
export async function deleteBindingOverride(bindingId: string, locationId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("binding_overrides")
    .delete()
    .eq("binding_id", bindingId)
    .eq("location_id", locationId);
  if (error) throw error;
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
