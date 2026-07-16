import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { OverrideBanner } from "@/components/OverrideBanner";
import { SignOut } from "@/components/SignOut";

export const metadata: Metadata = {
  title: "DynaMo — Context-Aware Ad Decisioning",
  description: "CoolSip live creative decisioning",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="brand">
            DynaMo <small>CoolSip · Summer Campaign</small>
          </div>
          <nav>
            <Link href="/">Portfolio</Link>
            <Link href="/history">History</Link>
            <SignOut />
          </nav>
        </header>
        <div className="wrap">
          <OverrideBanner />
          {children}
        </div>
      </body>
    </html>
  );
}
