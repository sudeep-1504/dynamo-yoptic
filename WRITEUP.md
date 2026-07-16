# DynaMo — Write-up

## What I built and why

**Data model.** The schema separates who's paying (`advertisers`, `campaigns`) from what's being decided (`creatives`, `bindings`) from what's true in the world (`locations`, `signal_types`, `signal_readings`) from what actually happened (`line_items`, `transitions`, `overrides`). The load-bearing choice: `signal_readings` are keyed by `(location, signal_type)`, never by campaign or line item — a city's weather is one fact, shared across every tenant targeting it, not duplicated per client. `bindings` store rules as data (`signal_type`, `field`, `op`, `value`, `priority`), not code, so campaign logic is configuration the engine reads generically. `transitions` is append-only — RLS grants no `UPDATE`/`DELETE` to any role — because it's the entire audit and trust story; nothing else matters if that log can be quietly edited.

**Tech choices.** Supabase over Airtable: Airtable can't enforce append-only at the data layer (any collaborator can edit a historical row through its own UI), and its 5 req/s cap contradicts the 200-city scale story; Supabase's row-level security makes the transition log genuinely tamper-resistant. WeatherAPI.com over Open-Meteo: Open-Meteo's free tier explicitly excludes ad-serving/commercial use; WeatherAPI.com's pricing page permits commercial use on its free tier and returns current conditions plus an hourly forecast in one call. The shared per-location cache is also the cost lever at scale: the brief's own numbers (10,000+ line items, 200+ cities, ~$0.001/call, $50/day cap, ~15-min tolerance) resolve to 200 signal lookups per cycle, not 10,000, because readings are per-city, not per-line-item — polling 200 cities every 10 minutes is ~28,800 calls/day (~$28.80), under the cap with real headroom.

**Decision logic.** The engine (`decide()`) is a pure function: signals and current state in, a winning creative and a structured reason out; a thin wrapper applies the result and writes the log. Order matters. An active human override wins outright, skipping everything else. A freshness gate follows: any required signal missing, failed, or older than 15 minutes drops to the default creative immediately (fail-safe), skipping dwell. Otherwise every binding's predicate is evaluated against the live snapshot and the highest-priority satisfied one wins (priority 0, `always_true`, guarantees a winner). Last, an asymmetric dwell check holds a low-stakes flip for 20 minutes but bypasses instantly for any move to the default creative or to a strictly higher-priority (more urgent) predicate.

**Visibility layer.** Three views, built cheapest-and-most-useful first: a portfolio grid (one card per city — current creative, a status chip [Auto/Fallback/Override/Paused], live signal summary, one-line why, data age) that answers "is anything wrong" with no click; a location detail live meter (signal → rule fired → creative, left to right, updating every cycle, data age and provider always visible, force/pause controls live here); and a history log (last 20–50 transitions per location, filterable by source, suppressed dwell flips shown rather than hidden). A persistent, loud override banner sits above all three, since a forgotten override is a named risk if it isn't impossible to miss.

## Three tradeoffs

**1. Fail-safe strictness over live-data value.** Chosen: any missing, failed, or stale signal drops to the default creative immediately, treating one flaky read the same as a real outage. Cut: uptime of the context creatives — a blip that would clear on the next poll instead sends the city to generic right away. With more time: distinguish a transient miss (one failed poll, fast retry) from a sustained outage before declaring a location stale, buying back uptime without weakening the tolerance guarantee.

**2. A signal-agnostic seam, not a full rules editor.** Chosen: the engine reads a generic `{signal_type, field, op, value}` predicate — weather is config, not code, checked directly against the engine code in the stretch answer below, not just asserted. Cut: an actual UI for a non-technical operator to author or edit bindings without schema access — bindings are seeded through an admin wizard for the rain/heat/default pattern, not a general editor. With more time: a proper no-code binding builder is the difference between an abstraction that's architecturally real and one that's operationally usable.

**3. Shared signal cache across tenants over full isolation.** Chosen: `signal_readings` are fetched once per `(location, signal_type)` and shared across every tenant targeting that location — this is what keeps the $50/day budget holding at 200 cities. Cut: clean per-tenant isolation at the signal layer; every other part of the model keeps tenants fully separate, this is the one deliberate exception, safe for a public signal like weather, unsafe the moment a future signal type is tenant-specific. With more time: tag `signal_types` as shared vs. tenant-scoped explicitly, so the exception is a flag the system understands rather than a special case bolted on later.

## Three edge cases my current MVP handles badly

**1. A line item can flip mid-impression.** DynaMo sets eligible state; it doesn't own the ad server, so a flip is invisible to an impression already serving downstream. Locked assumption: the ad server caches/lags rather than reading real-time — the conservative case, since being wrong about it costs one unused field, while wrongly assuming real-time costs a silent trust failure discovered in the field. Handled badly today even under this assumption: DynaMo can't force an in-flight impression to stop, only make the handoff auditable via `state_effective_as_of` on every read. Stated here as an assumption, not a settled fact, and worth raising live as a genuine open question, since it's a fact about a system this brief never specifies.

**2. One flaky poll and a real outage look identical.** Any single missing, failed, or stale reading drops a city to fallback for a full cycle, whether it was one bad call or an hours-long provider outage. Fix: give one missed poll a fast retry before declaring a location stale, so a momentary blip doesn't cost a full cycle in generic mode, without weakening the 15-minute tolerance guarantee for a genuine outage.

**3. One weather reading stands in for an entire metro.** A single lat/lng per city can be raining in one district and dry in another at the same moment; the centroid reading silently picks a side. Accepted at 4-city scale rather than hidden. Fix at real scale: multiple sample points per large metro, averaged or worst-cased depending on the brand's risk tolerance — a deliberate design choice worth naming rather than defaulting into.

## My answer to the stretch question

**Abstraction sketch:**
```
signal_types      { name, provider, schema }
      ↓
signal_readings   { location, signal_type, value, read_at, provider, fetch_status }
      ↓ read by
bindings          { creative, priority, predicate: { signal_type, field, op, value } }
      ↓ evaluated by
decide()          pure function, generic over signal_type/field/value — never mentions "weather"
```

Adding a new trigger — a cricket boundary, a football win/loss, an AQI spike, a market-index drop — needs exactly three additions, checked against the actual engine rather than asserted:

1. **One `signal_types` row** naming the new fact, e.g. `cricket.match_state`.
2. **One new adapter**, matching the same `fetch(location) → reading` shape the weather provider already uses (e.g. returning `{ last_ball_result: "boundary" }`). This is the one real piece of new work: `ingestAll()` today loops calls to the weather adapter by name; generalizing it into a small registry keyed by `signal_type` is the bounded scope of new code.
3. **New `bindings` rows**, e.g. "if `last_ball_result == "boundary"`, show 'Celebrate with CoolSip', priority 60" — slotting into the existing precedence order alongside rain (100) and heat (50).

Everything else — `decide()`, the freshness gate, dwell suppression, override precedence, the transition log, and every dashboard view — needs zero changes, because they already read `signal_type`/`field`/`value` as opaque strings, never as weather-typed fields. A cricket-derived stale reading fails safe exactly like a weather one; a suppressed cricket flip shows in history with the same `dwell_suppressed` flag. This is the actual test of the abstraction claim: a second signal type is a config change plus one adapter file, not an engine rewrite — and a multi-signal conflict (rain and a cricket win at the same moment) is already resolved by the same `priority` field every binding carries, regardless of which fact triggered it.
