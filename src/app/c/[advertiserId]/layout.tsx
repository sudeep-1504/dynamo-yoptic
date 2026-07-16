"use client";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useProfile } from "@/hooks/useProfile";
import { cn } from "@/lib/utils";
import { ChevronLeft, LayoutGrid, History as HistoryIcon } from "lucide-react";

// Shared chrome for one tenant's dashboard: the "all clients" breadcrumb
// (internal users only — a client user never sees the picker, so there's
// nothing to go "back" to), and the Portfolio/History section tabs. Hidden on
// a location drill-down page, which has its own "back to portfolio" link
// instead of competing with the tabs for attention.
export default function ClientDashboardLayout({ children }: { children: React.ReactNode }) {
  const { advertiserId } = useParams<{ advertiserId: string }>();
  const pathname = usePathname();
  const { profile } = useProfile();

  const base = `/c/${advertiserId}`;
  const isLocationDrilldown = pathname.startsWith(`${base}/location/`);

  const tabs = [
    { href: base, label: "Portfolio", icon: LayoutGrid, active: pathname === base },
    { href: `${base}/history`, label: "History", icon: HistoryIcon, active: pathname.startsWith(`${base}/history`) },
  ];

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
