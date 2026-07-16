"use client";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function MetricInfo({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className={cn("h-3 w-3 cursor-help text-muted-foreground/70 hover:text-muted-foreground", className)} />
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

// Copy lives in one place so the portfolio grid and the location meter agree.
export const METRIC_EXPLANATIONS = {
  status:
    "Auto: automation is picking the creative from live signals. Fallback: a required signal is missing/stale, so the safe default is showing. Override: a human forced this. Paused: a human paused this city.",
  dataAge:
    "Minutes since the live weather reading was taken. Signals are cached for 15 minutes — past that, the engine treats data as stale and fails safe to the default creative.",
  signal:
    "The live reading(s) this decision is based on: current precipitation and feels-like temperature, as returned by the weather provider.",
  why: "Which rule fired (or why none did), in plain language — the same reasoning that gets written to the permanent transition log.",
  ruleFired:
    "The highest-priority rule whose condition is currently true. Priority 0 (the default) always has a fallback winner if nothing else fires.",
  dwell:
    "Anti-flicker hold: once a context creative is showing, a flip to a lower- or equal-priority creative is held for 20 minutes to stop rapid back-and-forth near a threshold. A move toward the default, or to a strictly higher-priority trigger (e.g. dry → raining), always applies immediately.",
} as const;
