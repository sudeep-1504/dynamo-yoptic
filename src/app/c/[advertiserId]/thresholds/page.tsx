"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricInfo } from "@/components/MetricInfo";
import { Lock, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

interface OverrideRow {
  location_id: string;
  location_name: string;
  value: number;
}
interface BindingRow {
  id: string;
  creative_name: string;
  priority: number;
  signal_type: string;
  field: string;
  op: string;
  value: number;
  overrides: OverrideRow[];
}
interface LocationOption {
  id: string;
  name: string;
}

function BindingCard({
  binding,
  locations,
  canWrite,
  advertiserId,
  onChanged,
}: {
  binding: BindingRow;
  locations: LocationOption[];
  canWrite: boolean;
  advertiserId: string;
  onChanged: () => void;
}) {
  const [baseValue, setBaseValue] = useState(String(binding.value));
  const [newLocationId, setNewLocationId] = useState("");
  const [newValue, setNewValue] = useState("");
  const [busy, setBusy] = useState(false);

  const overriddenIds = new Set(binding.overrides.map((o) => o.location_id));
  const availableLocations = locations.filter((l) => !overriddenIds.has(l.id));

  async function post(body: any) {
    setBusy(true);
    try {
      const res = await fetch("/api/thresholds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ advertiser_id: advertiserId, binding_id: binding.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.reason ? `${data.error}: ${data.reason}` : data.error);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {binding.creative_name}
          <span className="text-xs font-normal text-muted-foreground">priority {binding.priority}</span>
        </CardTitle>
        <CardDescription>
          Fires when <code className="rounded bg-muted px-1 py-0.5">{binding.field}</code> {binding.op} threshold
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Campaign default:</span>
          <Input
            className="w-28"
            type="number"
            step="0.1"
            value={baseValue}
            disabled={!canWrite}
            onChange={(e) => setBaseValue(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!canWrite || busy || Number(baseValue) === binding.value}
            onClick={() => post({ value: Number(baseValue) })}
          >
            Save
          </Button>
          {!canWrite && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" /> admin access required
            </span>
          )}
        </div>

        {binding.overrides.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location override</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {binding.overrides.map((o) => (
                <OverrideRowEditor
                  key={o.location_id}
                  override={o}
                  canWrite={canWrite}
                  busy={busy}
                  onSave={(value) => post({ location_id: o.location_id, value })}
                  onRemove={() => post({ location_id: o.location_id, remove: true })}
                />
              ))}
            </TableBody>
          </Table>
        )}

        {canWrite && availableLocations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Select value={newLocationId} onValueChange={setNewLocationId}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Add location override…" /></SelectTrigger>
              <SelectContent>
                {availableLocations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="w-24"
              type="number"
              step="0.1"
              placeholder="value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !newLocationId || newValue === ""}
              onClick={async () => {
                await post({ location_id: newLocationId, value: Number(newValue) });
                setNewLocationId("");
                setNewValue("");
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OverrideRowEditor({
  override,
  canWrite,
  busy,
  onSave,
  onRemove,
}: {
  override: OverrideRow;
  canWrite: boolean;
  busy: boolean;
  onSave: (value: number) => void;
  onRemove: () => void;
}) {
  const [value, setValue] = useState(String(override.value));
  return (
    <TableRow>
      <TableCell>{override.location_name}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            className="w-24"
            type="number"
            step="0.1"
            value={value}
            disabled={!canWrite}
            onChange={(e) => setValue(e.target.value)}
          />
          {canWrite && Number(value) !== override.value && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onSave(Number(value))}>
              Save
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell>
        {canWrite && (
          <Button size="icon" variant="ghost" disabled={busy} title="Remove override" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function ThresholdsPage() {
  const { advertiserId } = useParams<{ advertiserId: string }>();
  const { profile } = useProfile();
  const canWrite = Boolean(profile?.is_admin);
  const [bindings, setBindings] = useState<BindingRow[] | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/thresholds?advertiser_id=${advertiserId}`, { cache: "no-store" });
    const data = await res.json();
    if (res.ok) {
      setBindings(data.bindings);
      setLocations(data.locations);
    }
  }, [advertiserId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-1.5 text-2xl font-semibold tracking-tight">
          Thresholds
          <MetricInfo text="The number each context rule compares against a live reading. A campaign-wide default applies everywhere; a per-location override wins for that one city only — useful when one city's climate makes the default number wrong for it (e.g. a heat threshold tuned for Delhi rarely firing in Bangalore)." />
        </h1>
        <p className="text-sm text-muted-foreground">
          Campaign-wide defaults, with optional per-location overrides.
        </p>
      </div>

      {!bindings ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : bindings.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No configurable rules for this campaign.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {bindings.map((b) => (
            <BindingCard
              key={b.id}
              binding={b}
              locations={locations}
              canWrite={canWrite}
              advertiserId={advertiserId}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
