import "./globals.css";
import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { TopBar } from "@/components/TopBar";
import { OverrideBanner } from "@/components/OverrideBanner";

export const metadata: Metadata = {
  title: "DynaMo — Context-Aware Ad Decisioning",
  description: "Live creative decisioning, powered by real-world signals",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <TooltipProvider delayDuration={150}>
          <div className="flex min-h-screen flex-col">
            <TopBar />
            <main className="container flex-1 py-6">
              <OverrideBanner />
              {children}
            </main>
          </div>
          <Toaster position="top-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
