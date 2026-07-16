"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useProfile } from "@/hooks/useProfile";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateCampaignDialog } from "@/components/CreateCampaignDialog";

interface AdvertiserSummary {
  advertiser_id: string;
  advertiser_name: string;
  campaign_count: number;
}

// Client-agnostic landing: internal (DynaMo team) users see the product with
// the client hidden behind a click — a picker of tenants. A client-role user
// (e.g. a brand lead/CMO) skips this entirely and lands on their own
// dashboard directly, since there's nothing else for them to pick between.
export default function HomePage() {
  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const router = useRouter();
  const [clients, setClients] = useState<AdvertiserSummary[] | null>(null);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadClients = () => {
    fetch("/api/clients", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.reason ? `${d.error}: ${d.reason}` : d.error || "failed to load clients");
        setClients(d.advertisers ?? []);
      })
      .catch((e) => setClientsError(String(e.message ?? e)));
  };

  useEffect(() => {
    if (!profile) return;
    if (profile.role === "client" && profile.advertiser_id) {
      router.replace(`/c/${profile.advertiser_id}`);
      return;
    }
    if (profile.role === "internal") {
      loadClients();
    }
  }, [profile, router]);

  if (profileLoading || (profile?.role === "client")) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (profileError) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-8 text-sm">
          <p className="font-medium text-destructive">Couldn&apos;t load your profile</p>
          <p className="mt-1 text-muted-foreground">{profileError}</p>
        </CardContent>
      </Card>
    );
  }

  if (clientsError) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-8 text-sm">
          <p className="font-medium text-destructive">Couldn&apos;t load clients</p>
          <p className="mt-1 text-muted-foreground">{clientsError}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Pick a client to open their live decisioning dashboard.
          </p>
        </div>
        {profile?.is_admin && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add client
          </Button>
        )}
      </div>

      {!clients ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No clients yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Link key={c.advertiser_id} href={`/c/${c.advertiser_id}`}>
              <Card className="group h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{c.advertiser_name}</CardTitle>
                      <CardDescription>
                        {c.campaign_count === 0
                          ? "No campaigns yet"
                          : `${c.campaign_count} campaign${c.campaign_count > 1 ? "s" : ""}`}
                      </CardDescription>
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
        mode="new-client"
        onCreated={(newCampaignId, newAdvertiserId) => {
          if (newAdvertiserId) router.push(`/c/${newAdvertiserId}/${newCampaignId}`);
        }}
      />
    </div>
  );
}
