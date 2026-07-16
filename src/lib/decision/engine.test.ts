import { describe, it, expect } from "vitest";
import { decide } from "./engine";
import { Binding, DecisionInput, SignalSnapshot } from "./types";

// --- CoolSip bindings, as configured (rules-as-data) ---
const RAIN = "creative-rain";
const HEAT = "creative-heat";
const DEFAULT = "creative-default";

const bindings: Binding[] = [
  {
    creative_id: RAIN,
    creative_name: "Rainy day pick-me-up",
    creative_role: "context",
    predicate: {
      type: "comparison",
      signal_type: "weather.precip",
      field: "precip_now",
      op: ">",
      value: 0.2,
    },
    priority: 100,
    trigger_type: "weather.precip",
  },
  {
    creative_id: HEAT,
    creative_name: "Beat the heat",
    creative_role: "context",
    predicate: {
      type: "comparison",
      signal_type: "weather.temp",
      field: "apparent_temp",
      op: ">=",
      value: 35,
    },
    priority: 50,
    trigger_type: "weather.temp",
  },
  {
    creative_id: DEFAULT,
    creative_name: "Refresh anytime",
    creative_role: "default",
    predicate: { type: "always_true" },
    priority: 0,
    trigger_type: "default",
  },
];

const NOW = "2026-07-16T12:00:00.000Z";

function freshSnapshot(precip: number, apparentTemp: number): SignalSnapshot {
  return {
    "weather.precip": {
      signal_type: "weather.precip",
      value: { precip_now: precip },
      read_at: "2026-07-16T11:58:00.000Z", // 2 min old
      provider: "weatherapi",
      fetch_status: "ok",
    },
    "weather.temp": {
      signal_type: "weather.temp",
      value: { apparent_temp: apparentTemp, temp_c: apparentTemp - 3 },
      read_at: "2026-07-16T11:58:00.000Z",
      provider: "weatherapi",
      fetch_status: "ok",
    },
  };
}

function baseInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    location_id: "loc-mumbai",
    campaign_id: "camp-1",
    bindings,
    snapshot: freshSnapshot(0, 25),
    current_creative_id: DEFAULT,
    last_state_change_at: "2026-07-16T10:00:00.000Z", // 2h ago, dwell elapsed
    override: null,
    config: {
      now: NOW,
      staleness_tolerance_minutes: 15,
      dwell_minutes: 20,
    },
    ...overrides,
  };
}

describe("predicate evaluation & precedence", () => {
  it("fires rain over heat when both hold (rain outranks heat)", () => {
    const r = decide(baseInput({ snapshot: freshSnapshot(1.2, 38) }));
    expect(r.winner_creative_id).toBe(RAIN);
    expect(r.rule_fired?.priority).toBe(100);
    expect(r.decision_source).toBe("auto");
  });

  it("fires heat when hot and dry", () => {
    const r = decide(baseInput({ snapshot: freshSnapshot(0, 38) }));
    expect(r.winner_creative_id).toBe(HEAT);
    expect(r.rule_fired?.priority).toBe(50);
  });

  it("falls to default when neither predicate holds", () => {
    const r = decide(baseInput({ snapshot: freshSnapshot(0, 25) }));
    expect(r.winner_creative_id).toBe(DEFAULT);
    expect(r.decision_source).toBe("auto");
    expect(r.state_changed).toBe(false); // already on default
  });

  it("respects the > threshold exactly (0.2 does not fire rain)", () => {
    const r = decide(baseInput({ snapshot: freshSnapshot(0.2, 25) }));
    expect(r.winner_creative_id).toBe(DEFAULT);
  });

  it("fires rain just above threshold", () => {
    const r = decide(baseInput({ snapshot: freshSnapshot(0.21, 25) }));
    expect(r.winner_creative_id).toBe(RAIN);
  });

  it("uses apparent temp, honoring >= boundary at 35", () => {
    const r = decide(baseInput({ snapshot: freshSnapshot(0, 35) }));
    expect(r.winner_creative_id).toBe(HEAT);
  });
});

describe("freshness gate (fail-safe)", () => {
  it("falls back to default when a required signal is missing", () => {
    const snap = freshSnapshot(1.2, 38);
    delete snap["weather.precip"];
    const r = decide(baseInput({ snapshot: snap, current_creative_id: HEAT }));
    expect(r.winner_creative_id).toBe(DEFAULT);
    expect(r.decision_source).toBe("fallback");
    expect(r.staleness_flag).toBe(true);
    expect(r.why).toMatch(/safe mode/i);
  });

  it("falls back when a reading is stale (older than tolerance)", () => {
    const snap = freshSnapshot(1.2, 38);
    snap["weather.precip"].read_at = "2026-07-16T11:40:00.000Z"; // 20 min old > 15
    const r = decide(baseInput({ snapshot: snap }));
    expect(r.decision_source).toBe("fallback");
    expect(r.staleness_flag).toBe(true);
  });

  it("falls back when a fetch failed", () => {
    const snap = freshSnapshot(1.2, 38);
    snap["weather.precip"].fetch_status = "failed";
    const r = decide(baseInput({ snapshot: snap }));
    expect(r.decision_source).toBe("fallback");
  });

  it("fail-safe bypasses dwell (immediate move to default)", () => {
    const snap = freshSnapshot(1.2, 38);
    snap["weather.temp"].fetch_status = "failed";
    const r = decide(
      baseInput({
        snapshot: snap,
        current_creative_id: RAIN,
        last_state_change_at: "2026-07-16T11:59:00.000Z", // 1 min ago, inside dwell
      })
    );
    expect(r.winner_creative_id).toBe(DEFAULT);
    expect(r.dwell_suppressed).toBe(false);
    expect(r.state_changed).toBe(true);
  });
});

describe("override (human outranks machine)", () => {
  it("forces a creative regardless of signals", () => {
    const r = decide(
      baseInput({
        snapshot: freshSnapshot(1.2, 38), // rain would fire
        override: {
          is_paused: false,
          forced_creative_id: DEFAULT,
          actor: "A.R.",
          created_at: NOW,
          expires_at: null,
        },
      })
    );
    expect(r.winner_creative_id).toBe(DEFAULT);
    expect(r.decision_source).toBe("override");
    expect(r.why).toMatch(/A\.R\./);
  });

  it("override outranks fail-safe (stale data)", () => {
    const snap = freshSnapshot(1.2, 38);
    snap["weather.precip"].fetch_status = "failed";
    const r = decide(
      baseInput({
        snapshot: snap,
        override: {
          is_paused: false,
          forced_creative_id: HEAT,
          actor: "op",
          created_at: NOW,
          expires_at: null,
        },
      })
    );
    expect(r.decision_source).toBe("override");
    expect(r.winner_creative_id).toBe(HEAT);
  });

  it("pause override yields no active creative", () => {
    const r = decide(
      baseInput({
        override: {
          is_paused: true,
          forced_creative_id: null,
          actor: "op",
          created_at: NOW,
          expires_at: null,
        },
      })
    );
    expect(r.is_paused).toBe(true);
    expect(r.winner_creative_id).toBeNull();
    expect(r.decision_source).toBe("override");
  });
});

describe("dwell (asymmetric anti-flap)", () => {
  it("suppresses a flip between two context creatives inside the window", () => {
    // Currently RAIN (100). Rain stops but still hot -> HEAT (50), a lower-priority
    // context flip inside dwell => suppress, hold RAIN.
    const r = decide(
      baseInput({
        snapshot: freshSnapshot(0, 38),
        current_creative_id: RAIN,
        last_state_change_at: "2026-07-16T11:55:00.000Z", // 5 min ago < 20
      })
    );
    expect(r.winner_creative_id).toBe(RAIN);
    expect(r.dwell_suppressed).toBe(true);
    expect(r.state_changed).toBe(false);
  });

  it("bypasses dwell for a strictly higher-priority move (dry -> raining)", () => {
    // Currently HEAT (50). Rain starts -> RAIN (100). Higher priority => immediate.
    const r = decide(
      baseInput({
        snapshot: freshSnapshot(1.2, 38),
        current_creative_id: HEAT,
        last_state_change_at: "2026-07-16T11:59:00.000Z", // 1 min ago, inside dwell
      })
    );
    expect(r.winner_creative_id).toBe(RAIN);
    expect(r.dwell_suppressed).toBe(false);
    expect(r.state_changed).toBe(true);
  });

  it("bypasses dwell for any move toward the default creative", () => {
    // Currently HEAT (50). Conditions clear -> DEFAULT. Default always immediate.
    const r = decide(
      baseInput({
        snapshot: freshSnapshot(0, 25),
        current_creative_id: HEAT,
        last_state_change_at: "2026-07-16T11:59:00.000Z", // inside dwell
      })
    );
    expect(r.winner_creative_id).toBe(DEFAULT);
    expect(r.dwell_suppressed).toBe(false);
  });

  it("applies the flip once the dwell window has elapsed", () => {
    const r = decide(
      baseInput({
        snapshot: freshSnapshot(0, 38),
        current_creative_id: RAIN,
        last_state_change_at: "2026-07-16T11:30:00.000Z", // 30 min ago > 20
      })
    );
    expect(r.winner_creative_id).toBe(HEAT);
    expect(r.dwell_suppressed).toBe(false);
    expect(r.state_changed).toBe(true);
  });
});

describe("reason schema completeness", () => {
  it("emits the full snapshot with age + provider for the rendered why", () => {
    const r = decide(baseInput({ snapshot: freshSnapshot(1.2, 38) }));
    expect(r.signal_snapshot).toHaveLength(2);
    const precip = r.signal_snapshot.find((s) => s.signal_type === "weather.precip");
    expect(precip?.provider).toBe("weatherapi");
    expect(precip?.age_minutes).toBeCloseTo(2, 0);
    expect(precip?.value.precip_now).toBe(1.2);
  });
});
