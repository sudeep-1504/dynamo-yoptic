"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricInfo, METRIC_EXPLANATIONS } from "@/components/MetricInfo";
import { useProfile } from "@/hooks/useProfile";
import { ChevronLeft, ArrowRight, Pause, Zap, FlaskConical, Lock } from "lucide-react";
import { toast } from "sonner";

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

const STATUS_STYLE: Record<string, string> = {
  Auto: "bg-success/15 text-success border-success/30",
  Fallback: "bg-warning/15 text-warning border-warning/30",
  Override: "bg-primary/15 text-primary border-primary/30",
  Paused: "bg-muted text-muted-foreground border-border",
};

function snapText(snap: SnapshotEntry[]): string {
  if (!snap?.length) return "—";
  const precip = snap.find((s) => s.signal_type === "weather.precip");
  const temp = snap.find((s) => s.signal_type === "weather.temp");
  const parts: string[] = [];
  if (temp?.value?.apparent_temp != null) parts.push(`feels ${temp.value.apparent_temp}°C`);
  if (precip?.value?.precip_now != null) parts.push(`rain ${precip.value.precip_now}`);
  const age = precip?.age_minutes ?? temp?.age_minutes;
  if (age != null) parts.push(`data ${age}m`);
  return parts.join(" · ") || "—";
}

export default function LocationDetailPage() {
  const { advertiserId, campaignId, id } = useParams<{ advertiserId: string; campaignId: string; id: string }>();
  const { profile } = useProfile();
  const canWrite = Boolean(profile?.is_admin);
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [forceId, setForceId] = useState("");
  const [inj, setInj] = useState({ precip: "", temp: "" });

  const load = useCallback(async () => {
    const res = await fetch(`/api/location/${id}?campaign_id=${campaignId}`, { cache: "no-store" });
    if (res.ok) setD(await res.json());
  }, [id, campaignId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  async function post(url: string, body?: any) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.reason ? `${data.error}: ${data.reason}` : data.error);
      await fetch("/api/cycle/run", { method: "POST" });
      await load();
      toast.success("Applied");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!d) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const precip = d.signal_snapshot.find((s) => s.signal_type === "weather.precip");
  const temp = d.signal_snapshot.find((s) => s.signal_type === "weather.temp");
  const provider = precip?.provider ?? temp?.provider ?? "—";
  const age = Math.max(precip?.age_minutes ?? 0, temp?.age_minutes ?? 0);

  return (
    <div className="space-y-6">
      <Link
        href={`/c/${advertiserId}/${campaignId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back to portfolio
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{d.location_name}</h1>
        <Badge variant="outline" className={STATUS_STYLE[d.status]}>{d.status}</Badge>
      </div>

      {/* Live meter: signal -> rule -> creative */}
      <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Live signal <MetricInfo text={METRIC_EXPLANATIONS.signal} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.signal_snapshot.length === 0 ? (
              <span className="text-warning text-sm">no data yet</span>
            ) : (
              <>
                <div className="text-lg font-semibold">
                  {temp?.value?.apparent_temp != null
                    ? `${temp.value.temp_c ?? "?"}°C · feels ${temp.value.apparent_temp}°C`
                    : "—"}
                </div>
                <div className="text-sm text-muted-foreground">Rain {precip?.value?.precip_now ?? "—"} mm/h</div>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={d.staleness_flag ? "text-warning" : ""}>data {age.toFixed(0)}m</span>
                  <span className="rounded border px-1 py-0.5">{provider}</span>
                  <MetricInfo text={METRIC_EXPLANATIONS.dataAge} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="hidden items-center justify-center md:flex">
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rule fired <MetricInfo text={METRIC_EXPLANATIONS.ruleFired} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.rule_fired ? (
              <>
                <div className="text-lg font-semibold">{d.rule_fired.name}</div>
                <div className="text-sm text-muted-foreground">priority {d.rule_fired.priority}</div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                {d.status === "Override" ? "override (human)" : "—"}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{d.why}</p>
          </CardContent>
        </Card>

        <div className="hidden items-center justify-center md:flex">
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Live creative
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {d.status === "Paused" ? "— paused —" : d.current_creative ?? "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operator controls — admin only; normal users are view-only */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            Operator controls
            {!canWrite && (
              <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <Lock className="h-3 w-3" /> admin access required
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Select value={forceId} onValueChange={setForceId} disabled={!canWrite}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Force creative…" /></SelectTrigger>
            <SelectContent>
              {d.creatives.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !forceId || !canWrite}
            onClick={() =>
              post("/api/override", { campaign_id: campaignId, location_id: id, forced_creative_id: forceId })
            }
          >
            <Zap className="mr-1.5 h-3.5 w-3.5" /> Force
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !canWrite}
            onClick={() => post("/api/override", { campaign_id: campaignId, location_id: id, is_paused: true })}
          >
            <Pause className="mr-1.5 h-3.5 w-3.5" /> Pause city
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <FlaskConical className="h-3.5 w-3.5" /> Condition injection (demo)
            {!canWrite && (
              <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <Lock className="h-3 w-3" /> admin access required
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input
            className="w-36"
            placeholder="precip mm/h"
            value={inj.precip}
            disabled={!canWrite}
            onChange={(e) => setInj({ ...inj, precip: e.target.value })}
          />
          <Input
            className="w-36"
            placeholder="apparent °C"
            value={inj.temp}
            disabled={!canWrite}
            onChange={(e) => setInj({ ...inj, temp: e.target.value })}
          />
          <Button
            size="sm"
            disabled={busy || !canWrite}
            onClick={() =>
              post("/api/inject", {
                campaign_id: campaignId,
                location_id: id,
                ...(inj.precip !== "" ? { precip_now: Number(inj.precip) } : {}),
                ...(inj.temp !== "" ? { apparent_temp: Number(inj.temp), temp_c: Number(inj.temp) } : {}),
              })
            }
          >
            Inject reading
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !canWrite}
            title="Inject a failed reading to demo the fail-safe"
            onClick={() => post("/api/inject", { campaign_id: campaignId, location_id: id, fail: true })}
          >
            Inject failure
          </Button>
        </CardContent>
      </Card>

      {/* Recent changes */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Recent changes</h2>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Creative</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Signal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.transitions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No transitions yet — run a cycle.
                  </TableCell>
                </TableRow>
              )}
              {d.transitions.map((t) => (
                <TableRow key={t.id} className={t.dwell_suppressed ? "opacity-60" : ""}>
                  <TableCell>{new Date(t.created_at).toLocaleTimeString()}</TableCell>
                  <TableCell>
                    {t.dwell_suppressed ? `held ${t.to_creative ?? ""} (suppressed)` : t.to_creative ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLE[t.decision_source === "auto" ? "Auto" : t.decision_source === "fallback" ? "Fallback" : "Override"]}>
                      {t.decision_source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {t.rule_fired_name ?? "—"}
                    {t.rule_fired_priority != null ? ` (p${t.rule_fired_priority})` : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{snapText(t.signal_snapshot)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
