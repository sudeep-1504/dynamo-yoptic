"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface SnapshotEntry {
  signal_type: string;
  value: Record<string, number>;
  age_minutes: number | null;
  provider: string | null;
  fetch_status: string;
}
interface TransitionRow {
  id: string;
  created_at: string;
  to_creative: string | null;
  from_creative: string | null;
  decision_source: string;
  rule_fired_name: string | null;
  rule_fired_priority: number | null;
  signal_snapshot: SnapshotEntry[];
  staleness_flag: boolean;
  dwell_suppressed: boolean;
}
interface Detail {
  location_id: string;
  location_name: string;
  current_creative: string | null;
  status: string;
  why: string;
  signal_snapshot: SnapshotEntry[];
  staleness_flag: boolean;
  rule_fired: { name: string; priority: number } | null;
  creatives: { id: string; name: string; role: string }[];
  transitions: TransitionRow[];
}

export default function LocationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [forceId, setForceId] = useState("");
  const [inj, setInj] = useState({ precip: "", temp: "" });

  const load = useCallback(async () => {
    const res = await fetch(`/api/location/${id}`, { cache: "no-store" });
    if (res.ok) setD(await res.json());
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  async function post(url: string, body?: any) {
    setBusy(true);
    try {
      await fetch(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      // Injecting/forcing then re-running the cycle makes the effect visible now.
      await fetch("/api/cycle/run", { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <p className="muted">Loading…</p>;

  const precip = d.signal_snapshot.find((s) => s.signal_type === "weather.precip");
  const temp = d.signal_snapshot.find((s) => s.signal_type === "weather.temp");
  const provider = precip?.provider ?? temp?.provider ?? "—";
  const age = Math.max(
    precip?.age_minutes ?? 0,
    temp?.age_minutes ?? 0
  );

  return (
    <div>
      <p style={{ margin: "8px 0" }}>
        <Link href="/">← Portfolio</Link>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>{d.location_name}</h2>
        <span className={`chip ${d.status.toLowerCase()}`}>{d.status}</span>
      </div>

      {/* The live meter: signal -> rule -> creative, left to right */}
      <div className="meter">
        <div className="box">
          <h4>Live Signal</h4>
          {d.signal_snapshot.length === 0 ? (
            <span className="stale">no data yet</span>
          ) : (
            <>
              <div className="big">
                {temp?.value?.apparent_temp != null
                  ? `${temp.value.temp_c ?? "?"}°C · feels ${temp.value.apparent_temp}°C`
                  : "—"}
              </div>
              <div style={{ marginTop: 4 }}>
                Rain {precip?.value?.precip_now ?? "—"} mm/h
              </div>
              <div className="age" style={{ marginTop: 8 }}>
                <span className={d.staleness_flag ? "stale" : ""}>data {age.toFixed(0)}m</span>{" "}
                · <span className="tag">{provider}</span>
              </div>
            </>
          )}
        </div>
        <div className="arrow">▶</div>
        <div className="box">
          <h4>Rule Fired</h4>
          {d.rule_fired ? (
            <>
              <div className="big">{d.rule_fired.name}</div>
              <div className="muted" style={{ marginTop: 6 }}>
                priority {d.rule_fired.priority}
              </div>
            </>
          ) : (
            <div className="muted">{d.status === "Override" ? "override (human)" : "—"}</div>
          )}
          <div className="why" style={{ marginTop: 8 }}>{d.why}</div>
        </div>
        <div className="arrow">▶</div>
        <div className="box">
          <h4>Live Creative</h4>
          <div className="big">
            {d.status === "Paused" ? "— paused —" : d.current_creative ?? "—"}
          </div>
        </div>
      </div>

      {/* Controls: force creative / pause / inject */}
      <div className="section-title">Operator controls</div>
      <div className="controls">
        <select value={forceId} onChange={(e) => setForceId(e.target.value)}>
          <option value="">Force creative…</option>
          {d.creatives.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          disabled={busy || !forceId}
          onClick={() => post("/api/override", { location_id: id, forced_creative_id: forceId })}
        >
          Force
        </button>
        <button
          disabled={busy}
          onClick={() => post("/api/override", { location_id: id, is_paused: true })}
        >
          Pause city
        </button>
      </div>

      <div className="section-title">Condition injection (demo)</div>
      <div className="controls">
        <input
          style={{ width: 130 }}
          placeholder="precip mm/h"
          value={inj.precip}
          onChange={(e) => setInj({ ...inj, precip: e.target.value })}
        />
        <input
          style={{ width: 130 }}
          placeholder="apparent °C"
          value={inj.temp}
          onChange={(e) => setInj({ ...inj, temp: e.target.value })}
        />
        <button
          disabled={busy}
          onClick={() =>
            post("/api/inject", {
              location_id: id,
              ...(inj.precip !== "" ? { precip_now: Number(inj.precip) } : {}),
              ...(inj.temp !== "" ? { apparent_temp: Number(inj.temp), temp_c: Number(inj.temp) } : {}),
            })
          }
        >
          Inject reading
        </button>
        <button
          disabled={busy}
          onClick={() => post("/api/inject", { location_id: id, fail: true })}
          title="Inject a failed reading to demo the fail-safe"
        >
          Inject failure
        </button>
      </div>

      {/* Recent changes / transition timeline */}
      <div className="section-title">Recent changes</div>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Creative</th>
            <th>Source</th>
            <th>Rule</th>
            <th>Signal</th>
          </tr>
        </thead>
        <tbody>
          {d.transitions.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No transitions yet — run a cycle.
              </td>
            </tr>
          )}
          {d.transitions.map((t) => (
            <tr key={t.id} className={t.dwell_suppressed ? "suppressed" : ""}>
              <td>{new Date(t.created_at).toLocaleTimeString()}</td>
              <td>
                {t.dwell_suppressed
                  ? `held ${t.to_creative ?? ""} (flip suppressed)`
                  : t.to_creative ?? "—"}
              </td>
              <td>
                <span className={`chip ${t.decision_source}`}>{t.decision_source}</span>
              </td>
              <td>
                {t.rule_fired_name ?? "—"}
                {t.rule_fired_priority != null ? ` (p${t.rule_fired_priority})` : ""}
              </td>
              <td className="muted">{snapText(t.signal_snapshot)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function snapText(snap: SnapshotEntry[]): string {
  if (!snap || snap.length === 0) return "—";
  const precip = snap.find((s) => s.signal_type === "weather.precip");
  const temp = snap.find((s) => s.signal_type === "weather.temp");
  const parts: string[] = [];
  if (temp?.value?.apparent_temp != null) parts.push(`feels ${temp.value.apparent_temp}°C`);
  if (precip?.value?.precip_now != null) parts.push(`rain ${precip.value.precip_now}`);
  const age = precip?.age_minutes ?? temp?.age_minutes;
  if (age != null) parts.push(`data ${age}m`);
  return parts.join(" · ") || "—";
}
