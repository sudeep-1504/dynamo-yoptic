"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricInfo, METRIC_EXPLANATIONS } from "@/components/MetricInfo";

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

const STATUS_STYLE: Record<string, string> = {
  auto: "bg-success/15 text-success border-success/30",
  fallback: "bg-warning/15 text-warning border-warning/30",
  override: "bg-primary/15 text-primary border-primary/30",
};

function snapText(snap: SnapshotEntry[]): string {
  if (!snap?.length) return "—";
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
  const { advertiserId } = useParams<{ advertiserId: string }>();
  const [rows, setRows] = useState<TransitionRow[]>([]);
  const [source, setSource] = useState<string>("all");
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [locationId, setLocationId] = useState<string>("all");

  const load = useCallback(async () => {
    const q = new URLSearchParams({ advertiser_id: advertiserId });
    if (source !== "all") q.set("source", source);
    if (locationId !== "all") q.set("location_id", locationId);
    q.set("limit", "100");
    const res = await fetch(`/api/history?${q.toString()}`, { cache: "no-store" });
    const data = await res.json();
    setRows(data.transitions ?? []);
  }, [advertiserId, source, locationId]);

  useEffect(() => {
    fetch(`/api/portfolio?advertiser_id=${advertiserId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((p) =>
        setLocations((p.locations ?? []).map((l: any) => ({ id: l.location_id, name: l.location_name })))
      )
      .catch(() => {});
  }, [advertiserId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transition history</h1>
        <p className="text-sm text-muted-foreground">
          Every state change, plus suppressed anti-flap flips, each rendered from the reason schema.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="fallback">Fallback</SelectItem>
            <SelectItem value="override">Override</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead className="flex items-center gap-1">
                Signal snapshot <MetricInfo text={METRIC_EXPLANATIONS.signal} />
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">
                  Flags <MetricInfo text={METRIC_EXPLANATIONS.dwell} />
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No transitions yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => (
              <TableRow key={t.id} className={t.dwell_suppressed ? "opacity-60" : ""}>
                <TableCell className="whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</TableCell>
                <TableCell>{t.location_name}</TableCell>
                <TableCell>
                  {t.from_creative ? `${t.from_creative} → ` : ""}
                  <span className="font-medium">{t.to_creative ?? "—"}</span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_STYLE[t.decision_source]}>
                    {t.decision_source}
                  </Badge>
                </TableCell>
                <TableCell>
                  {t.rule_fired_name ?? "—"}
                  {t.rule_fired_priority != null ? ` (p${t.rule_fired_priority})` : ""}
                </TableCell>
                <TableCell className="text-muted-foreground">{snapText(t.signal_snapshot)}</TableCell>
                <TableCell className="space-x-1">
                  {t.staleness_flag && <Badge variant="outline" className={STATUS_STYLE.fallback}>stale</Badge>}
                  {t.dwell_suppressed && <Badge variant="outline">dwell-suppressed</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
