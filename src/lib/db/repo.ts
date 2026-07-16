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
  advertiser_name: string;
  dwell_minutes: number;
}

export interface LocationRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

// The single campaign for the MVP (CoolSip). At scale this iterates campaigns.
export async function getPrimaryCampaign(): Promise<CampaignConfig> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("campaigns")
    .select("id, name, dwell_minutes, advertisers(name)")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error) throw error;
  return {
    campaign_id: data.id,
    campaign_name: data.name,
    advertiser_name: (data as any).advertisers?.name ?? "",
    dwell_minutes: data.dwell_minutes,
  };
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

// Current active creative + when state last changed, for a location.
export async function getCurrentState(locationId: string): Promise<{
  current_creative_id: string | null;
  last_state_change_at: string;
}> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("line_items")
    .select("creative_id, state, last_state_change_at")
    .eq("location_id", locationId);
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

export async function getActiveOverride(
  locationId: string,
  campaignId: string
): Promise<ActiveOverride | null> {
  const db = supabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("overrides")
    .select("is_paused, forced_creative_id, actor, created_at, expires_at, released_at, location_id, campaign_id")
    .is("released_at", null)
    .or(`location_id.eq.${locationId},campaign_id.eq.${campaignId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data as any[]).filter(
    (o) => !o.expires_at || o.expires_at > nowIso
  );
  // Location-scoped override wins over campaign-scoped.
  const loc = rows.find((o) => o.location_id === locationId);
  const camp = rows.find((o) => o.campaign_id === campaignId);
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

// Apply the decision: set winner active, all others at this location paused,
// bump last_state_change_at only for line items whose state actually changed.
export async function applyState(
  locationId: string,
  winnerCreativeId: string | null,
  stateChanged: boolean
): Promise<void> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("line_items")
    .select("id, creative_id, state")
    .eq("location_id", locationId);
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
