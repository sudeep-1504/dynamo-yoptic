"use client";
import { useEffect, useState, useCallback } from "react";

interface SnapshotEntry {
  signal_type: string;
  value: Record<string, number>;
  age_minutes: number | null;
  provider: string | null;
}
interface TransitionRow {
  id: string;
  created_at: string;
  location_name: string;
  from_creative: string | null;
  to_creative: string | null;
  decision_source: string;
  rule_fired_name: string | null;
  rule_fired_priority: number | null;
  signal_snapshot: SnapshotEntry[];
  staleness_flag: boolean;
  dwell_suppressed: boolean;
}

function snapText(snap: SnapshotEntry[]): string {
  if (!snap || snap.length === 0) return "—";
  const precip = snap.find((s) => s.signal_type === "weather.precip");
  const temp = snap.find((s) => s.signal_type === "weather.temp");
  const parts: string[] = [];
  if (temp?.value?.apparent_temp != null) parts.push(`feels ${temp.value.apparent_temp}°C`);
  if (precip?.value?.precip_now != null) parts.push(`rain ${precip.value.precip_now}mm/h`);
  const age = precip?.age_minutes ?? temp?.age_minutes;
  if (age != null) parts.push(`data ${age}m`);
  const prov = precip?.provider ?? temp?.provider;
  if (prov) parts.push(prov);
  return parts.join(" · ") || "—";
}

export default function HistoryPage() {
  const [rows, setRows] = useState<TransitionRow[]>([]);
  const [source, setSource] = useState("");
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [locationId, setLocationId] = useState("");

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (source) q.set("source", source);
    if (locationId) q.set("location_id", locationId);
    q.set("limit", "100");
    const res = await fetch(`/api/history?${q.toString()}`, { cache: "no-store" });
    const data = await res.json();
    setRows(data.transitions ?? []);
  }, [source, locationId]);

  useEffect(() => {
    // Derive the location filter list from the portfolio.
    fetch("/api/portfolio", { cache: "no-store" })
      .then((r) => r.json())
      .then((p) =>
        setLocations(
          (p.locations ?? []).map((l: any) => ({ id: l.location_id, name: l.location_name }))
        )
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div>
      <h2>Transition history</h2>
      <p className="muted">
        Every state change, plus suppressed anti-flap flips (⊘), each rendered from the
        full reason schema.
      </p>
      <div className="controls">
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          <option value="auto">Auto</option>
          <option value="fallback">Fallback</option>
          <option value="override">Override</option>
        </select>
      </div>

      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Location</th>
            <th>Change</th>
            <th>Source</th>
            <th>Rule</th>
            <th>Signal snapshot</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No transitions yet.
              </td>
            </tr>
          )}
          {rows.map((t) => (
            <tr key={t.id} className={t.dwell_suppressed ? "suppressed" : ""}>
              <td>{new Date(t.created_at).toLocaleString()}</td>
              <td>{t.location_name}</td>
              <td>
                {t.from_creative ? `${t.from_creative} → ` : ""}
                <b>{t.to_creative ?? "—"}</b>
              </td>
              <td>
                <span className={`chip ${t.decision_source}`}>{t.decision_source}</span>
              </td>
              <td>
                {t.rule_fired_name ?? "—"}
                {t.rule_fired_priority != null ? ` (p${t.rule_fired_priority})` : ""}
              </td>
              <td className="muted">{snapText(t.signal_snapshot)}</td>
              <td>
                {t.staleness_flag && <span className="tag stale">stale</span>}{" "}
                {t.dwell_suppressed && <span className="tag">dwell-suppressed</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
