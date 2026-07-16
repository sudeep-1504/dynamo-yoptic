import { supabaseAdmin } from "@/lib/supabase/server";
import { getWeatherProvider } from "@/lib/weather/provider";
import { getSignalTypeMap, getLocations, LocationRow } from "@/lib/db/repo";

const TTL_MINUTES = 15;

// Is the most recent OK/injected reading for (location, signal_type) still fresh?
async function isCached(
  locationId: string,
  signalTypeId: string
): Promise<boolean> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("signal_readings")
    .select("read_at, fetch_status")
    .eq("location_id", locationId)
    .eq("signal_type_id", signalTypeId)
    .neq("fetch_status", "failed")
    .order("read_at", { ascending: false })
    .limit(1);
  const r = (data as any[])?.[0];
  if (!r) return false;
  const ageMin = (Date.now() - new Date(r.read_at).getTime()) / 60000;
  return ageMin < TTL_MINUTES;
}

async function writeReading(
  locationId: string,
  signalTypeId: string,
  value: Record<string, number>,
  provider: string,
  status: "ok" | "failed" | "injected"
) {
  const db = supabaseAdmin();
  const { error } = await db.from("signal_readings").insert({
    location_id: locationId,
    signal_type_id: signalTypeId,
    value,
    provider,
    fetch_status: status,
  });
  if (error) throw error;
}

export interface IngestResult {
  location: string;
  status: "fetched" | "cached" | "failed" | "no_provider";
  detail?: string;
}

// Fetch weather for one location and write both signal readings. Failure is
// isolated per location (BE-10): a failure writes 'failed' readings for that
// location only and does not throw up the stack.
async function ingestLocation(
  loc: LocationRow,
  byName: Record<string, string>,
  force: boolean
): Promise<IngestResult> {
  const provider = getWeatherProvider();
  if (!provider) return { location: loc.name, status: "no_provider" };

  const precipId = byName["weather.precip"];
  const tempId = byName["weather.temp"];

  if (!force) {
    const [pCached, tCached] = await Promise.all([
      isCached(loc.id, precipId),
      isCached(loc.id, tempId),
    ]);
    if (pCached && tCached) return { location: loc.name, status: "cached" };
  }

  try {
    const w = await provider.fetch(loc.lat, loc.lng);
    await Promise.all([
      writeReading(loc.id, precipId, { precip_now: w.precip_now }, w.provider, "ok"),
      writeReading(
        loc.id,
        tempId,
        { apparent_temp: w.apparent_temp, temp_c: w.temp_c },
        w.provider,
        "ok"
      ),
    ]);
    return {
      location: loc.name,
      status: "fetched",
      detail: `${w.condition}${w.forecast_transition_soon ? " · transition soon" : ""}`,
    };
  } catch (e: any) {
    // Failure isolation: mark this location's readings failed, keep going.
    await Promise.all([
      writeReading(loc.id, precipId, {}, provider.name, "failed"),
      writeReading(loc.id, tempId, {}, provider.name, "failed"),
    ]).catch(() => {});
    return { location: loc.name, status: "failed", detail: String(e?.message ?? e) };
  }
}

// Ingest signals for all locations (respects 15-min cache unless force=true).
export async function ingestAll(force = false): Promise<IngestResult[]> {
  const [{ byName }, locations] = await Promise.all([
    getSignalTypeMap(),
    getLocations(),
  ]);
  const results: IngestResult[] = [];
  for (const loc of locations) {
    results.push(await ingestLocation(loc, byName, force));
  }
  return results;
}

// Condition injection (P0-14): write a fake reading for a location, bypassing the
// real fetch. Drives the "working and breaking on cue" demo.
export interface InjectionPayload {
  precip_now?: number;
  apparent_temp?: number;
  temp_c?: number;
  fail?: boolean; // inject a failed reading to demo the fail-safe path
}

export async function injectReading(
  locationId: string,
  payload: InjectionPayload
): Promise<void> {
  const { byName } = await getSignalTypeMap();
  const precipId = byName["weather.precip"];
  const tempId = byName["weather.temp"];

  if (payload.fail) {
    await Promise.all([
      writeReading(locationId, precipId, {}, "injected", "failed"),
      writeReading(locationId, tempId, {}, "injected", "failed"),
    ]);
    return;
  }

  const tasks: Promise<void>[] = [];
  if (payload.precip_now != null) {
    tasks.push(
      writeReading(locationId, precipId, { precip_now: payload.precip_now }, "injected", "injected")
    );
  }
  if (payload.apparent_temp != null || payload.temp_c != null) {
    tasks.push(
      writeReading(
        locationId,
        tempId,
        {
          apparent_temp: payload.apparent_temp ?? payload.temp_c ?? 0,
          temp_c: payload.temp_c ?? payload.apparent_temp ?? 0,
        },
        "injected",
        "injected"
      )
    );
  }
  await Promise.all(tasks);
}
