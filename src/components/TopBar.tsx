"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SignOut } from "@/components/SignOut";
import { ShieldCheck } from "lucide-react";

export function TopBar() {
  const { profile, loading } = useProfile();
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname.startsWith("/auth/");

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            D
          </span>
          DynaMo
        </Link>

        {!isAuthPage && (
          <nav className="flex items-center gap-2">
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : profile ? (
              <>
                {profile.role === "internal" && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/">All clients</Link>
                  </Button>
                )}
                {profile.role === "internal" && profile.is_admin && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/admin/users">
                      <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                      Team &amp; clients
                    </Link>
                  </Button>
                )}
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {profile.display_name || profile.email}
                </span>
                <SignOut />
              </>
            ) : null}
          </nav>
        )}
      </div>
    </header>
  );
}
