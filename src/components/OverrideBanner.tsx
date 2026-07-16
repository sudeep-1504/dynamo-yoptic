"use client";
import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";

interface OverrideRow {
  id: string;
  location_name: string | null;
  forced_creative_name: string | null;
  is_paused: boolean;
  actor: string;
  created_at: string;
  expires_at: string | null;
}

// Overrides are campaign-scoped, but this banner is mounted globally in the
// root layout — so it derives the current campaign from the URL
// (/c/[advertiserId]/[campaignId]/...) and renders nothing outside a
// campaign dashboard (e.g. on the client or campaign picker pages).
function campaignIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/c\/[^/]+\/([^/]+)/);
  return m ? m[1] : null;
}

export function OverrideBanner() {
  const pathname = usePathname();
  const campaignId = campaignIdFromPath(pathname);
  const { profile } = useProfile();
  const canWrite = Boolean(profile?.is_admin);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);

  const load = useCallback(async () => {
    if (!campaignId) return;
    try {
      const res = await fetch(`/api/override?campaign_id=${campaignId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setOverrides(data.overrides ?? []);
    } catch {
      /* ignore */
    }
  }, [campaignId]);

  useEffect(() => {
    setOverrides([]);
    if (!campaignId) return;
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [campaignId, load]);

  async function release(id: string) {
    await fetch("/api/override/release", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ override_id: id }),
    });
    load();
  }

  if (!campaignId || overrides.length === 0) return null;
  const anyPaused = overrides.some((o) => o.is_paused);

  return (
    <div
      className={
        "mb-6 space-y-2 rounded-lg border p-4 " +
        (anyPaused ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5")
      }
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="h-4 w-4" />
        {overrides.length} active override{overrides.length > 1 ? "s" : ""} — human control is on.
      </div>
      {overrides.map((o) => (
        <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{o.location_name ?? "Campaign-wide"}</span>:{" "}
            {o.is_paused ? "PAUSED" : `forced → "${o.forced_creative_name}"`} by {o.actor} ·{" "}
            {new Date(o.created_at).toLocaleTimeString()}
            {o.expires_at
              ? ` · expires ${new Date(o.expires_at).toLocaleTimeString()}`
              : " · no expiry"}
          </span>
          <Button size="sm" variant="outline" disabled={!canWrite} onClick={() => release(o.id)}>
            Release
          </Button>
        </div>
      ))}
    </div>
  );
}
