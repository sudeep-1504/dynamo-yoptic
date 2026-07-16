"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface LocationOption {
  id: string;
  name: string;
}

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "new-client" | "existing-client";
  advertiserId?: string;
  onCreated: (campaignId: string, advertiserId?: string) => void;
}

// Onboards a new client + campaign, or adds a campaign to an existing client.
// Seeds the same rain > heat > default 3-tier pattern every CoolSip-style
// campaign uses (a lightweight opinionated setup, not a rules editor — that's
// explicitly out of MVP scope) via POST /api/admin/campaigns.
export function CreateCampaignDialog({ open, onOpenChange, mode, advertiserId, onCreated }: CreateCampaignDialogProps) {
  const [newAdvertiserName, setNewAdvertiserName] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [rainEnabled, setRainEnabled] = useState(true);
  const [rainCreative, setRainCreative] = useState("Rainy day pick-me-up");
  const [rainThreshold, setRainThreshold] = useState("0.2");
  const [heatEnabled, setHeatEnabled] = useState(true);
  const [heatCreative, setHeatCreative] = useState("Beat the heat");
  const [heatThreshold, setHeatThreshold] = useState("35");
  const [defaultCreative, setDefaultCreative] = useState("Refresh anytime");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/locations", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLocations(d.locations ?? []))
      .catch(() => setLocations([]));
  }, [open]);

  function toggleLocation(id: string) {
    setSelectedLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setNewAdvertiserName("");
    setCampaignName("");
    setRainEnabled(true);
    setRainCreative("Rainy day pick-me-up");
    setRainThreshold("0.2");
    setHeatEnabled(true);
    setHeatCreative("Beat the heat");
    setHeatThreshold("35");
    setDefaultCreative("Refresh anytime");
    setSelectedLocationIds(new Set());
  }

  async function submit() {
    if (mode === "new-client" && !newAdvertiserName.trim()) {
      toast.error("Client name is required");
      return;
    }
    if (!campaignName.trim() || !defaultCreative.trim()) {
      toast.error("Campaign name and default creative are required");
      return;
    }
    if (!rainEnabled && !heatEnabled) {
      toast.error("At least one context rule (rain or heat) is required");
      return;
    }
    if (selectedLocationIds.size === 0) {
      toast.error("Select at least one city");
      return;
    }

    setBusy(true);
    try {
      const body: any = {
        campaign_name: campaignName,
        rain: rainEnabled ? { creative_name: rainCreative, threshold: Number(rainThreshold) } : null,
        heat: heatEnabled ? { creative_name: heatCreative, threshold: Number(heatThreshold) } : null,
        default_creative_name: defaultCreative,
        location_ids: Array.from(selectedLocationIds),
      };
      if (mode === "new-client") body.new_advertiser_name = newAdvertiserName;
      else body.advertiser_id = advertiserId;

      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.reason ? `${data.error}: ${data.reason}` : data.error);
      toast.success("Campaign created");
      reset();
      onOpenChange(false);
      onCreated(data.campaign_id, data.advertiser_id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "new-client" ? "Add a new client" : "Add a campaign"}</DialogTitle>
          <DialogDescription>
            Seeds the standard rain / heat / default rule set — thresholds and locations can be adjusted later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "new-client" && (
            <div className="space-y-1.5">
              <Label htmlFor="advertiser-name">Client name</Label>
              <Input
                id="advertiser-name"
                value={newAdvertiserName}
                onChange={(e) => setNewAdvertiserName(e.target.value)}
                placeholder="e.g. CoolSip"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="campaign-name">Campaign name</Label>
            <Input
              id="campaign-name"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g. Summer 2026"
            />
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={rainEnabled} onChange={(e) => setRainEnabled(e.target.checked)} />
              Rain rule (priority 100)
            </label>
            {rainEnabled && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Creative name</Label>
                  <Input value={rainCreative} onChange={(e) => setRainCreative(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">precip_now &gt; (mm/h)</Label>
                  <Input type="number" step="0.1" value={rainThreshold} onChange={(e) => setRainThreshold(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={heatEnabled} onChange={(e) => setHeatEnabled(e.target.checked)} />
              Heat rule (priority 50)
            </label>
            {heatEnabled && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Creative name</Label>
                  <Input value={heatCreative} onChange={(e) => setHeatCreative(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">apparent_temp &gt;= (°C)</Label>
                  <Input type="number" step="0.1" value={heatThreshold} onChange={(e) => setHeatThreshold(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="default-creative">Default creative (priority 0, always on)</Label>
            <Input id="default-creative" value={defaultCreative} onChange={(e) => setDefaultCreative(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Cities to target</Label>
            {locations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading cities…</p>
            ) : (
              <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border p-2">
                {locations.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={selectedLocationIds.has(l.id)}
                      onChange={() => toggleLocation(l.id)}
                    />
                    {l.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
