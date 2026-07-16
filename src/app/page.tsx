"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface SnapshotEntry {
  signal_type: string;
  value: Record<string, number>;
  age_minutes: number | null;
  provider: string | null;
  fetch_status: string;
}
interface LocationCard {
  location_id: string;
  location_name: string;
  current_creative: string | null;
  status: "Auto" | "Fallback" | "Override" | "Paused";
  why: string;
  signal_snapshot: SnapshotEntry[];
  data_age_minutes: number | null;
  staleness_flag: boolean;
  dwell_suppressed: boolean;
}
interface Portfolio {
  campaign_name: string;
  advertiser_name: string;
  counts: { auto: number; fallback: number; override: number; paused: number };
  locations: LocationCard[];
  weather_enabled: boolean;
  error?: string;
}

function signalSummary(snap: SnapshotEntry[]): string {
  const precip = snap.find((s) => s.signal_type === "weather.precip");
  const temp = snap.find((s) => s.signal_type === "weather.temp");
  const parts: string[] = [];
  if (temp?.value?.apparent_temp != null)
    parts.push(`${temp.value.temp_c ?? "?"}°C feels ${temp.value.apparent_temp}°C`);
  if (precip?.value?.precip_now != null)
    parts.push(`rain ${precip.value.precip_now}mm/h`);
  if (parts.length === 0) return "no live signal";
  return parts.join(" · ");
}

export default function PortfolioPage() {
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/portfolio", { cache: "no-store" });
    const data = await res.json();
    setPf(data);
    return data as Portfolio;
  }, []);

  // Auto-refresh: ingest fresh weather (15-min cached, cheap) + run a cycle, so
  // live data flows without a manual click or waiting on the daily cron. Fires on
  // mount and every 3 minutes; only when a weather key is configured.
  const autoRefresh = useCallback(async () => {
    try {
      await fetch("/api/refresh", { method: "POST" });
    } catch {
      /* non-fatal — the poll below still shows whatever is current */
    }
  }, []);

  useEffect(() => {
    // First load tells us whether weather is enabled; if so, kick a refresh.
    (async () => {
      const data = await load();
      if (data?.weather_enabled) {
        await autoRefresh();
        await load();
      }
    })();
    const poll = setInterval(load, 8000);
    const refresh = setInterval(async () => {
      await autoRefresh();
      await load();
    }, 180000);
    return () => {
      clearInterval(poll);
      clearInterval(refresh);
    };
  }, [load, autoRefresh]);

  async function action(label: string, url: string) {
    setBusy(label);
    setMsg(null);
    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.reason ? `${data.error}: ${data.reason}` : data.error || "failed");
      if (url.includes("cycle")) {
        const changed = (data.decisions || []).filter((d: any) => d.state_changed).length;
        setMsg(`Cycle ran · ${changed} state change(s)`);
      } else if (url.includes("refresh")) {
        setMsg(`Fetched live weather · ${data.changes ?? 0} creative change(s)`);
      } else {
        setMsg(`${label} done`);
      }
      await load();
    } catch (e: any) {
      setMsg(`${label} error: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  if (!pf) return <p className="muted">Loading portfolio…</p>;

  if (pf.error) {
    return (
      <div className="notice">
        <strong>Backend not fully configured.</strong>
        <p className="muted">{pf.error}</p>
        <p className="muted">
          The most likely cause is a missing <code>SUPABASE_SERVICE_ROLE_KEY</code>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: "8px 0" }}>
            {pf.advertiser_name} — {pf.campaign_name}
          </h2>
          <div className="counts">
            <span className="chip auto">Auto {pf.counts.auto}</span>
            <span className="chip fallback">Fallback {pf.counts.fallback}</span>
            <span className="chip override">Override {pf.counts.override}</span>
            <span className="chip paused">Paused {pf.counts.paused}</span>
          </div>
        </div>
        <div className="controls">
          <button
            className="primary"
            disabled={busy != null}
            onClick={() => action("Run cycle", "/api/cycle/run")}
          >
            {busy === "Run cycle" ? "Running…" : "▶ Run cycle now"}
          </button>
          <button
            disabled={busy != null || !pf.weather_enabled}
            title={pf.weather_enabled ? "" : "Set WEATHERAPI_KEY to enable live fetches"}
            onClick={() => action("Fetch weather", "/api/refresh?force=true")}
          >
            {busy === "Fetch weather" ? "Fetching…" : "⤓ Fetch live weather"}
          </button>
        </div>
      </div>

      {!pf.weather_enabled && (
        <p className="muted" style={{ marginTop: 8 }}>
          Live weather fetching is off (no <code>WEATHERAPI_KEY</code>). Use condition
          injection on a location to demo decisions.
        </p>
      )}
      {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}

      <div className="grid">
        {pf.locations.map((loc) => (
          <Link
            href={`/location/${loc.location_id}`}
            key={loc.location_id}
            style={{ color: "inherit" }}
          >
            <div className={`card status-${loc.status.toLowerCase()}`}>
              <h3>
                {loc.location_name}
                <span className={`chip ${loc.status.toLowerCase()}`}>{loc.status}</span>
              </h3>
              <div className="creative">
                {loc.status === "Paused" ? "— paused —" : loc.current_creative ?? "—"}
              </div>
              <div className="signal">
                {loc.status === "Fallback" ? (
                  <span className="stale">weather data unavailable</span>
                ) : (
                  signalSummary(loc.signal_snapshot)
                )}
              </div>
              <div className="why">
                <span className="muted">why:</span> {loc.why}
              </div>
              <div className="age">
                {loc.data_age_minutes == null ? (
                  <span className="stale">no data yet</span>
                ) : (
                  <span className={loc.staleness_flag ? "stale" : ""}>
                    data {loc.data_age_minutes}m old
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
