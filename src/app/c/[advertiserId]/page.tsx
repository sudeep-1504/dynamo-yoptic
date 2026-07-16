"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useProfile } from "@/hooks/useProfile";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Megaphone, ArrowRight, Plus } from "lucide-react";
import { CreateCampaignDialog } from "@/components/CreateCampaignDialog";

interface CampaignSummary {
  campaign_id: string;
  campaign_name: string;
  advertiser_id: string;
  advertiser_name: string;
}

// One client can now run more than one campaign, so this page sits between
// the client picker and a campaign's dashboard: auto-skips straight through
// when there's only one campaign (the common case), otherwise shows a picker.
export default function CampaignPickerPage() {
  const { advertiserId } = useParams<{ advertiserId: string }>();
  const router = useRouter();
  const { profile } = useProfile();
  const canWrite = Boolean(profile?.is_admin);
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns?advertiser_id=${advertiserId}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.reason ? `${data.error}: ${data.reason}` : data.error || "failed to load campaigns");
      setSkipping(false);
      return;
    }
    setCampaigns(data.campaigns ?? []);
    if ((data.campaigns ?? []).length === 1) {
      router.replace(`/c/${advertiserId}/${data.campaigns[0].campaign_id}`);
    } else {
      setSkipping(false);
    }
  }, [advertiserId, router]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-8 text-sm">
          <p className="font-medium text-destructive">Couldn&apos;t load campaigns</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!campaigns || skipping) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {campaigns[0]?.advertiser_name ?? "Campaigns"}
          </h1>
          <p className="text-sm text-muted-foreground">Pick a campaign to open its live decisioning dashboard.</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add campaign
          </Button>
        )}
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No campaigns yet for this client.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <Link key={c.campaign_id} href={`/c/${advertiserId}/${c.campaign_id}`}>
              <Card className="group h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                      <Megaphone className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{c.campaign_name}</CardTitle>
                      <CardDescription>Live decisioning</CardDescription>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateCampaignDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode="existing-client"
        advertiserId={advertiserId}
        onCreated={(newCampaignId) => router.push(`/c/${advertiserId}/${newCampaignId}`)}
      />
    </div>
  );
}
