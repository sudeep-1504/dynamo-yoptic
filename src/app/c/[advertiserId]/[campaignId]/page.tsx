"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricInfo, METRIC_EXPLANATIONS } from "@/components/MetricInfo";
import { Play, CloudSun } from "lucide-react";
import { toast } from "sonner";

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
  advertiser_id: string;
  campaign_name: string;
  advertiser_name: string;
  counts: { auto: number; fallback: number; override: number; paused: number };
  locations: LocationCard[];
  weather_enabled: boolean;
  error?: string;
}

const STATUS_STYLE: Record<string, string> = {
  Auto: "bg-success/15 text-success border-success/30",
  Fallback: "bg-warning/15 text-warning border-warning/30",
  Override: "bg-primary/15 text-primary border-primary/30",
  Paused: "bg-muted text-muted-foreground border-border",
};

function signalSummary(snap: SnapshotEntry[]): string {
  const precip = snap.find((s) => s.signal_type === "weather.precip");
  const temp = snap.find((s) => s.signal_type === "weather.temp");
  const parts: string[] = [];
  if (temp?.value?.apparent_temp != null)
    parts.push(`${temp.value.temp_c ?? "?"}°C · feels ${temp.value.apparent_temp}°C`);
  if (precip?.value?.precip_now != null) parts.push(`rain ${precip.value.precip_now}mm/h`);
  return parts.length ? parts.join(" · ") : "no live signal";
}

export default function ClientPortfolioPage() {
  const { advertiserId, campaignId } = useParams<{ advertiserId: string; campaignId: string }>();
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/portfolio?campaign_id=${campaignId}`, { cache: "no-store" });
    const data = await res.json();
    setPf(data);
    return data as Portfolio;
  }, [campaignId]);

  const autoRefresh = useCallback(async () => {
    try {
      await fetch("/api/refresh", { method: "POST" });
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
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
    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.reason ? `${data.error}: ${data.reason}` : data.error || "failed");
      if (url.includes("cycle")) {
        const changed = (data.decisions || []).filter((d: any) => d.state_changed).length;
        toast.success(`Cycle ran · ${changed} change(s)`);
      } else {
        toast.success(`Fetched live weather · ${data.changes ?? 0} change(s)`);
      }
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!pf) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (pf.error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-8 text-sm">
          <p className="font-medium text-destructive">Couldn&apos;t load this dashboard</p>
          <p className="mt-1 text-muted-foreground">{pf.error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {pf.advertiser_name} <span className="text-muted-foreground">/ {pf.campaign_name}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={STATUS_STYLE.Auto}>Auto {pf.counts.auto}</Badge>
            <Badge variant="outline" className={STATUS_STYLE.Fallback}>Fallback {pf.counts.fallback}</Badge>
            <Badge variant="outline" className={STATUS_STYLE.Override}>Override {pf.counts.override}</Badge>
            <Badge variant="outline" className={STATUS_STYLE.Paused}>Paused {pf.counts.paused}</Badge>
            <MetricInfo text={METRIC_EXPLANATIONS.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy != null}
            onClick={() => action("cycle", "/api/cycle/run")}
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            {busy === "cycle" ? "Running…" : "Run cycle now"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy != null || !pf.weather_enabled}
            title={pf.weather_enabled ? "" : "Weather provider not configured"}
            onClick={() => action("weather", "/api/refresh?force=true")}
          >
            <CloudSun className="mr-1.5 h-3.5 w-3.5" />
            {busy === "weather" ? "Fetching…" : "Fetch live weather"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {pf.locations.map((loc) => (
          <Link href={`/c/${advertiserId}/${campaignId}/location/${loc.location_id}`} key={loc.location_id}>
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <span className="font-medium">{loc.location_name}</span>
                <Badge variant="outline" className={STATUS_STYLE[loc.status]}>
                  {loc.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2 pt-0 text-sm">
                <div className="text-base font-semibold">
                  {loc.status === "Paused" ? "— paused —" : loc.current_creative ?? "—"}
                </div>
                <div className="text-muted-foreground">
                  {loc.status === "Fallback" ? (
                    <span className="text-warning">weather data unavailable</span>
                  ) : (
                    signalSummary(loc.signal_snapshot)
                  )}
                </div>
                <div className="flex items-start gap-1 text-xs text-muted-foreground">
                  <span className="line-clamp-2">{loc.why}</span>
                  <MetricInfo text={METRIC_EXPLANATIONS.why} className="mt-0.5 shrink-0" />
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {loc.data_age_minutes == null ? (
                    <span className="text-warning">no data yet</span>
                  ) : (
                    <span className={loc.staleness_flag ? "text-warning" : "text-muted-foreground"}>
                      data {loc.data_age_minutes}m old
                    </span>
                  )}
                  <MetricInfo text={METRIC_EXPLANATIONS.dataAge} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
