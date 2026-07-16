// Signal-agnostic decision types. The engine never mentions "weather" — it reads
// generic SignalReadings and evaluates Predicates. Weather is just config.

export type ComparisonOp = ">" | ">=" | "<" | "<=" | "==" | "!=";

export type Predicate =
  | {
      type: "comparison";
      signal_type: string; // e.g. "weather.precip"
      field: string; // e.g. "precip_now"
      op: ComparisonOp;
      value: number;
    }
  | { type: "always_true" };

export interface Binding {
  id: string;
  creative_id: string;
  creative_name: string;
  creative_role: "context" | "default";
  predicate: Predicate;
  priority: number; // 0 reserved for the always-true default binding
  trigger_type: string | null;
}

export interface SignalReading {
  signal_type: string; // e.g. "weather.precip"
  value: Record<string, number>; // e.g. { precip_now: 1.2 }
  read_at: string; // ISO timestamp
  provider: string;
  fetch_status: "ok" | "failed" | "injected";
}

// Snapshot passed to the engine: one reading per signal_type for a location.
export type SignalSnapshot = Record<string, SignalReading>;

export interface ActiveOverride {
  is_paused: boolean;
  forced_creative_id: string | null;
  actor: string;
  created_at: string;
  expires_at: string | null;
}

export interface DecisionInput {
  location_id: string;
  campaign_id: string;
  bindings: Binding[];
  snapshot: SignalSnapshot;
  // Which creative is currently active (null if the location is paused / none active).
  current_creative_id: string | null;
  // When the current state was last changed (drives dwell).
  last_state_change_at: string;
  override: ActiveOverride | null;
  config: {
    now: string; // ISO — injected so the engine stays pure/testable
    staleness_tolerance_minutes: number; // default 15
    dwell_minutes: number; // default 20, config per campaign
  };
}

// One line in the rendered signal snapshot for the reason schema / UI.
export interface SnapshotEntry {
  signal_type: string;
  value: Record<string, number>;
  age_minutes: number | null;
  provider: string | null;
  fetch_status: SignalReading["fetch_status"] | "missing";
}

export interface DecisionResult {
  // Winner. If paused (override), winner_creative_id is null.
  winner_creative_id: string | null;
  winner_creative_name: string | null;
  is_paused: boolean;

  decision_source: "auto" | "fallback" | "override";
  trigger_type: string | null;
  rule_fired: { name: string; priority: number } | null;

  from_creative_id: string | null;
  signal_snapshot: SnapshotEntry[];
  staleness_flag: boolean;
  dwell_suppressed: boolean;

  // True when the applied state differs from current_creative_id (or pause state).
  state_changed: boolean;

  // Human-readable one-liner for the portfolio "why".
  why: string;
}
