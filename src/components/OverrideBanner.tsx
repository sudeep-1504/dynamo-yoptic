"use client";
import { useEffect, useState, useCallback } from "react";

interface OverrideRow {
  id: string;
  location_name: string | null;
  forced_creative_name: string | null;
  is_paused: boolean;
  actor: string;
  created_at: string;
  expires_at: string | null;
}

export function OverrideBanner() {
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/override", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setOverrides(data.overrides ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function release(id: string) {
    await fetch("/api/override/release", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ override_id: id }),
    });
    load();
  }

  if (overrides.length === 0) return null;
  const anyPaused = overrides.some((o) => o.is_paused);

  return (
    <div className={"banner" + (anyPaused ? " paused-banner" : "")}>
      <strong>⚠ {overrides.length} active override{overrides.length > 1 ? "s" : ""}</strong>{" "}
      — human control is on. Auto-decisioning is suspended where forced.
      {overrides.map((o) => (
        <div className="ov-row" key={o.id}>
          <span>
            <b>{o.location_name ?? "campaign"}</b>:{" "}
            {o.is_paused ? "PAUSED" : `forced → "${o.forced_creative_name}"`} by{" "}
            {o.actor} · {new Date(o.created_at).toLocaleTimeString()}
            {o.expires_at
              ? ` · expires ${new Date(o.expires_at).toLocaleTimeString()}`
              : " · no expiry"}
          </span>
          <button onClick={() => release(o.id)}>Release ▸</button>
        </div>
      ))}
    </div>
  );
}
