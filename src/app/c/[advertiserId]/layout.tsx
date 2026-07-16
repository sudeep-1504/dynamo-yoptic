"use client";
import Link from "next/link";
import { useProfile } from "@/hooks/useProfile";
import { ChevronLeft } from "lucide-react";

// The "all clients" breadcrumb — internal users only (a client user never
// sees the picker, so there's nothing to go "back" to). Shown across the
// campaign picker and every campaign's dashboard beneath it. The
// Portfolio/History/Thresholds tabs live one level deeper, in
// [campaignId]/layout.tsx, since they're specific to one campaign.
export default function AdvertiserLayout({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  return (
    <div>
      {profile?.role === "internal" && (
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> All clients
        </Link>
      )}
      {children}
    </div>
  );
}
