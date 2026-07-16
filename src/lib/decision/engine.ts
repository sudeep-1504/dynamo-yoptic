// The DynaMo decision engine — a pure function per location.
// Signals + current state in, winning creative + structured reason out.
// It NEVER mutates state. A thin wrapper (pipeline.ts) applies the result.
//
// Pipeline (mirrors PRD 5.3 / CLAUDE.md decision pipeline):
//   1. Override check      — human outranks everything, including fail-safe.
//   2. Signal snapshot     — read cached readings, note age + provider.
//   3. Freshness gate      — missing/failed/stale required signal => DEFAULT, skip dwell.
//   4. Predicate eval      — highest-priority satisfied predicate wins.
//   5. Dwell (asymmetric)  — suppress low-stakes flips; bypass safety-critical ones.
//   6. Result              — winner + full reason schema (wrapper writes + logs).

import {
  Binding,
  DecisionInput,
  DecisionResult,
  Predicate,
  SignalSnapshot,
  SnapshotEntry,
} from "./types";

function ageMinutes(readAtIso: string, nowIso: string): number {
  const ms = new Date(nowIso).getTime() - new Date(readAtIso).getTime();
  return ms / 60000;
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    default:
      return false;
  }
}

// Signal types a non-default binding depends on. These are the "required" signals
// for the freshness gate: if any is missing/failed/stale, we fail safe.
function requiredSignalTypes(bindings: Binding[]): string[] {
  const set = new Set<string>();
  for (const b of bindings) {
    if (b.predicate.type === "comparison") set.add(b.predicate.signal_type);
  }
  return [...set];
}

function evaluatePredicate(p: Predicate, snapshot: SignalSnapshot): boolean {
  if (p.type === "always_true") return true;
  const reading = snapshot[p.signal_type];
  if (!reading) return false;
  const fieldVal = reading.value?.[p.field];
  if (typeof fieldVal !== "number" || Number.isNaN(fieldVal)) return false;
  return compare(fieldVal, p.op, p.value);
}

function defaultBinding(bindings: Binding[]): Binding | undefined {
  // Priority-0 always-true binding is the guaranteed floor.
  return (
    bindings.find(
      (b) => b.predicate.type === "always_true" || b.priority === 0
    ) ?? bindings.find((b) => b.creative_role === "default")
  );
}

function buildSnapshotEntries(
  bindings: Binding[],
  snapshot: SignalSnapshot,
  nowIso: string
): SnapshotEntry[] {
  const types = requiredSignalTypes(bindings);
  return types.map((st) => {
    const r = snapshot[st];
    if (!r) {
      return {
        signal_type: st,
        value: {},
        age_minutes: null,
        provider: null,
        fetch_status: "missing" as const,
      };
    }
    return {
      signal_type: st,
      value: r.value,
      age_minutes: Number(ageMinutes(r.read_at, nowIso).toFixed(1)),
      provider: r.provider,
      fetch_status: r.fetch_status,
    };
  });
}

function priorityOfCreative(
  creativeId: string | null,
  bindings: Binding[]
): number {
  if (!creativeId) return -1; // nothing active (e.g. was paused) => lowest
  const b = bindings.find((x) => x.creative_id === creativeId);
  return b ? b.priority : -1;
}

export function decide(input: DecisionInput): DecisionResult {
  const { bindings, snapshot, override, current_creative_id, config } = input;
  const now = config.now;
  const snapshotEntries = buildSnapshotEntries(bindings, snapshot, now);

  const def = defaultBinding(bindings);

  // ---- Step 1: Override check. Human outranks all automation, incl. fail-safe.
  // The wrapper only passes an active (unreleased, unexpired) override here.
  if (override) {
    if (override.is_paused) {
      const changed = current_creative_id !== null;
      return {
        winner_creative_id: null,
        winner_creative_name: null,
        is_paused: true,
        decision_source: "override",
        trigger_type: "override",
        rule_fired: null,
        from_creative_id: current_creative_id,
        signal_snapshot: snapshotEntries,
        staleness_flag: false,
        dwell_suppressed: false,
        state_changed: changed,
        why: `Paused by ${override.actor}`,
      };
    }
    const forced = bindings.find(
      (b) => b.creative_id === override.forced_creative_id
    );
    const changed = current_creative_id !== override.forced_creative_id;
    return {
      winner_creative_id: override.forced_creative_id,
      winner_creative_name: forced?.creative_name ?? null,
      is_paused: false,
      decision_source: "override",
      trigger_type: "override",
      rule_fired: null,
      from_creative_id: current_creative_id,
      signal_snapshot: snapshotEntries,
      staleness_flag: false,
      dwell_suppressed: false,
      state_changed: changed,
      why: `Forced to "${forced?.creative_name ?? "creative"}" by ${override.actor}`,
    };
  }

  // ---- Step 2 & 3: Freshness gate. Any required signal missing/failed/stale
  // => resolve to DEFAULT (fail-safe), flag stale, and SKIP dwell.
  const required = requiredSignalTypes(bindings);
  const tolerance = config.staleness_tolerance_minutes;
  const staleReasons: string[] = [];
  for (const st of required) {
    const r = snapshot[st];
    if (!r) {
      staleReasons.push(`${st} missing`);
    } else if (r.fetch_status === "failed") {
      staleReasons.push(`${st} failed`);
    } else if (ageMinutes(r.read_at, now) > tolerance) {
      staleReasons.push(`${st} stale`);
    }
  }

  if (staleReasons.length > 0) {
    const changed = current_creative_id !== (def?.creative_id ?? null);
    return {
      winner_creative_id: def?.creative_id ?? null,
      winner_creative_name: def?.creative_name ?? null,
      is_paused: false,
      decision_source: "fallback",
      trigger_type: "fallback",
      rule_fired: def ? { name: def.creative_name, priority: def.priority } : null,
      from_creative_id: current_creative_id,
      signal_snapshot: snapshotEntries,
      staleness_flag: true,
      dwell_suppressed: false, // fail-safe bypasses dwell
      state_changed: changed,
      why: "Safe mode: weather data unavailable",
    };
  }

  // ---- Step 4: Predicate evaluation. Highest-priority satisfied predicate wins.
  const satisfied = bindings
    .filter((b) => evaluatePredicate(b.predicate, snapshot))
    .sort((a, b) => b.priority - a.priority);

  const winner = satisfied[0] ?? def; // always_true guarantees a winner
  if (!winner) {
    // No default binding configured — should never happen (enforced at save-time),
    // but never leave a location with no eligible creative.
    return {
      winner_creative_id: null,
      winner_creative_name: null,
      is_paused: false,
      decision_source: "fallback",
      trigger_type: "fallback",
      rule_fired: null,
      from_creative_id: current_creative_id,
      signal_snapshot: snapshotEntries,
      staleness_flag: true,
      dwell_suppressed: false,
      state_changed: current_creative_id !== null,
      why: "No eligible creative — misconfigured campaign (no default binding)",
    };
  }

  const winnerIsDefault =
    winner.creative_role === "default" || winner.priority === 0;
  const winnerChanges = winner.creative_id !== current_creative_id;

  // ---- Step 5: Dwell (asymmetric anti-flap).
  // Bypass (apply immediately) if winner is the default, OR winner is a strictly
  // higher priority than current (e.g. dry->raining). Otherwise, hold if inside
  // the dwell window.
  if (winnerChanges) {
    const currentPriority = priorityOfCreative(current_creative_id, bindings);
    const safetyCritical = winnerIsDefault || winner.priority > currentPriority;

    if (!safetyCritical) {
      const sinceChange = ageMinutes(input.last_state_change_at, now);
      if (sinceChange < config.dwell_minutes) {
        // HOLD current state, log a suppressed flip (visible in history, never hidden).
        const current = bindings.find(
          (b) => b.creative_id === current_creative_id
        );
        return {
          winner_creative_id: current_creative_id,
          winner_creative_name: current?.creative_name ?? null,
          is_paused: false,
          decision_source: "auto",
          trigger_type: winner.trigger_type,
          rule_fired: current
            ? { name: current.creative_name, priority: current.priority }
            : null,
          from_creative_id: current_creative_id,
          signal_snapshot: snapshotEntries,
          staleness_flag: false,
          dwell_suppressed: true,
          state_changed: false,
          why: `Held "${current?.creative_name ?? "current"}" — flip to "${winner.creative_name}" suppressed (dwell ${config.dwell_minutes}m)`,
        };
      }
    }
  }

  // ---- Step 6: Result. Winner applies.
  return {
    winner_creative_id: winner.creative_id,
    winner_creative_name: winner.creative_name,
    is_paused: false,
    decision_source: "auto",
    trigger_type: winner.trigger_type,
    rule_fired: { name: winner.creative_name, priority: winner.priority },
    from_creative_id: current_creative_id,
    signal_snapshot: snapshotEntries,
    staleness_flag: false,
    dwell_suppressed: false,
    state_changed: winnerChanges,
    why: predicateWhy(winner, bindings, snapshot),
  };
}

// Renders the actual reading value alongside its threshold, e.g.
// "apparent_temp 25.8 (need >= 35)" — so the reason is a concrete comparison,
// not just the rule's name.
function describeComparison(b: Binding, snapshot: SignalSnapshot): string {
  if (b.predicate.type !== "comparison") return "";
  const p = b.predicate;
  const actual = snapshot[p.signal_type]?.value?.[p.field];
  const actualStr = typeof actual === "number" ? actual : "no data";
  return `${p.field} ${actualStr} (need ${p.op} ${p.value})`;
}

// The default (always_true) binding winning is only ever a MEANINGFUL result
// because every higher-priority predicate was checked and failed — so its
// reason names each of those, with the actual value that fell short, rather
// than the uninformative "no context trigger active". A context binding
// winning gets the concrete comparison that fired it.
function predicateWhy(winner: Binding, bindings: Binding[], snapshot: SignalSnapshot): string {
  if (winner.predicate.type === "always_true") {
    const others = bindings
      .filter((b) => b.predicate.type === "comparison")
      .sort((a, b) => b.priority - a.priority);
    if (others.length === 0) return "Default — no context rules configured for this campaign";
    const parts = others.map((b) => describeComparison(b, snapshot));
    return `No trigger met — ${parts.join("; ")} — showing default creative`;
  }
  return `Triggered: ${describeComparison(winner, snapshot)}`;
}
