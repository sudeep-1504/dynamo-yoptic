"use client";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutGrid, History as HistoryIcon, SlidersHorizontal } from "lucide-react";

// Portfolio/History/Thresholds tabs for one campaign. Shown to every
// authorized viewer, internal or client, admin or normal — view access
// doesn't depend on the admin flag, only the write actions inside each page
// do. Hidden on a location drill-down, which has its own "back to portfolio"
// link instead of competing with the tabs for attention.
export default function CampaignDashboardLayout({ children }: { children: React.ReactNode }) {
  const { advertiserId, campaignId } = useParams<{ advertiserId: string; campaignId: string }>();
  const pathname = usePathname();

  const base = `/c/${advertiserId}/${campaignId}`;
  const isLocationDrilldown = pathname.startsWith(`${base}/location/`);

  const tabs = [
    { href: base, label: "Portfolio", icon: LayoutGrid, active: pathname === base },
    { href: `${base}/history`, label: "History", icon: HistoryIcon, active: pathname.startsWith(`${base}/history`) },
    {
      href: `${base}/thresholds`,
      label: "Thresholds",
      icon: SlidersHorizontal,
      active: pathname.startsWith(`${base}/thresholds`),
    },
  ];

  return (
    <div>
      {!isLocationDrilldown && (
        <nav className="mb-5 flex gap-1 border-b">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                t.active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      {children}
    </div>
  );
}
