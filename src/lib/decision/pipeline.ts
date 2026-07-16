// The thin wrapper around the pure engine. It loads state from the DB, calls
// decide() (which never mutates), then applies the result: writes line_item state
// and appends the immutable transition. This is the SAME code path for the
// scheduled loop and the manual "run cycle now" trigger — no demo-only variant.
//
// Client-agnostic by construction: it iterates every tenant's campaign, never
// assumes there is only one (PRD Section 3 / BE-19).

import { decide } from "./engine";
import { DecisionResult } from "./types";
import {
  applyState,
  getActiveOverride,
  getAllCampaigns,
  getBindings,
  getCurrentState,
  getLocations,
  getSignalTypeMap,
  getSnapshot,
  logTransition,
} from "@/lib/db/repo";

export interface LocationDecision {
  campaign_id: string;
  location_id: string;
  location_name: string;
  result: DecisionResult;
}

const STALENESS_TOLERANCE_MINUTES = 15;

export async function runCycle(): Promise<LocationDecision[]> {
  const [campaigns, locations, sig] = await Promise.all([
    getAllCampaigns(),
    getLocations(),
    getSignalTypeMap(),
  ]);

  const decisions: LocationDecision[] = [];

  for (const campaign of campaigns) {
    const bindings = await getBindings(campaign.campaign_id);

    for (const loc of locations) {
      const [snapshot, current, override] = await Promise.all([
        getSnapshot(loc.id, sig.byId),
        getCurrentState(loc.id, campaign.campaign_id),
        getActiveOverride(loc.id, campaign.campaign_id),
      ]);

      const result = decide({
        location_id: loc.id,
        campaign_id: campaign.campaign_id,
        bindings,
        snapshot,
        current_creative_id: current.current_creative_id,
        last_state_change_at: current.last_state_change_at,
        override,
        config: {
          now: new Date().toISOString(),
          staleness_tolerance_minutes: STALENESS_TOLERANCE_MINUTES,
          dwell_minutes: campaign.dwell_minutes,
        },
      });

      // Apply: set winner active / others paused (only if state changed), then log.
      await applyState(loc.id, campaign.campaign_id, result.winner_creative_id, result.state_changed);

      // Log a transition on every state change, and also on suppressed flips (so
      // anti-flap is auditable). Steady no-op cycles don't spam the log.
      if (result.state_changed || result.dwell_suppressed) {
        await logTransition(loc.id, campaign.campaign_id, result);
      }

      decisions.push({
        campaign_id: campaign.campaign_id,
        location_id: loc.id,
        location_name: loc.name,
        result,
      });
    }
  }

  return decisions;
}
