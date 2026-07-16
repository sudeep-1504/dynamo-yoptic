# DynaMo — Write-up

## Approach

DynaMo decides which creative is eligible per location from live signals, and keeps that decision auditable and reversible by a human. Weather is signal one; the schema, decision engine, and UI are signal-agnostic by design, so a second trigger type is a config change, not a rewrite. Three things are non-negotiable and drove every tradeoff below: a wrong creative never airs on unknown data (fail-safe), every state answers "why" without a click (visibility), and a human override always wins (trust).

The engine is a pure function — signals and current state in, a winning creative and a structured reason out — wrapped by a thin pipeline that applies the result and appends an insert-only transition log. Stack: Supabase Postgres (append-only RLS on the audit table, which Airtable can't enforce), WeatherAPI.com (the only free tier with commercial-use terms and both current + forecast in one call), Vercel.

## Tradeoffs

**1. Fail-safe strictness over live-data value.** On any missing, failed, or stale (>15min) signal, the location drops to the default creative immediately, treating one flaky read the same as a real outage. Cut: uptime of context creatives — a blip that would clear on the next poll instead sends the city to generic right away. With more time: distinguish a transient miss (one failed poll, fast retry) from a sustained outage before declaring a location stale, buying back uptime without weakening the tolerance guarantee.

**2. A signal-agnostic seam, not a full rules editor.** The engine reads a generic `{signal_type, field, op, value}` predicate model — weather is config, not code — the minimum needed to make the extensibility claim true rather than asserted (see below). Cut: a UI for a campaign operator to author bindings without schema access; in the MVP, bindings are seeded through an admin wizard, not hand-authored per rule. With more time: a no-code binding editor is the difference between an abstraction that's architecturally real and one that's operationally usable.

**3. Shared signal cache across tenants over per-tenant isolation.** Weather in Mumbai is one fact, not one fact per advertiser, so `signal_readings` are fetched once per (location, signal_type) and shared across every tenant targeting that location — the one deliberate exception to otherwise-full tenant isolation, and what keeps API cost flat regardless of client count. Safe for a public, non-proprietary signal; unsafe the moment a future signal type is tenant-specific. With more time: tag `signal_types` as shared vs. tenant-scoped explicitly, so the exception is a flag the system already understands rather than a special case.

## Edge cases handled badly today

**1. A line item flips mid-impression.** DynaMo sets eligible state; it doesn't own the ad server, so a flip is invisible to an impression already serving downstream. Locked assumption: the ad server caches/lags rather than reading real-time (the conservative case — wrong-and-real-time costs one unused field, wrong-and-cached costs a silent trust failure). Every read pairs state with `state_effective_as_of` so the consumer judges staleness itself. This is a genuine open question, not a settled one (see below).

**2. One global threshold treats every city as climatically identical.** apparent_temp ≥ 35°C fires reliably in Delhi and almost never in Bangalore — not because the rule is wrong, but because the number wasn't set for that city. Fixed in this build: thresholds are a campaign-wide default with an optional per-location override that wins when present (`binding_overrides` table), so Bangalore can carry its own number without a second campaign.

**3. One weather reading stands in for a whole metro.** A single lat/long per city can be raining in one district and dry in another at the same moment; the centroid reading silently picks a side. Accepted at 4-city scale rather than hidden. At real scale (200+ cities), this needs multiple sample points per large metro, averaged or worst-cased depending on the brand's risk tolerance — itself a design choice worth naming rather than defaulting into.

## Constraints that matter at scale

This build runs 12 line items across 4 cities. The brief's actual scale target — 10,000+ line items, 200+ cities, ~$0.001 per weather call, a $50/day cap, ~15-minute staleness tolerance — isn't built here, but the architecture is checked against it rather than ignored.

The load-bearing choice is BE-5: `signal_readings` are keyed by `(location, signal_type)`, never by line item. A city's weather is one fact regardless of how many creatives or clients target it, so a decision cycle costs one signal lookup per city, not one per line item — 200 cities means 200 lookups whether they carry 12 line items or 10,000. Throughput scales with location count (NFR-3), which is exactly what `ingestAll()`'s per-location loop and the shared TTL cache already do at 4 cities; nothing structural changes at 200.

Cost, at the brief's own numbers: 200 cities polled every 10 minutes (inside the 15-minute tolerance, BE-7) is 200 × 6 × 24 = 28,800 calls/day. At $0.001/call that's ~$28.80/day — under the $50 cap with ~$21/day of headroom. (WeatherAPI.com's actual free/Starter pricing makes the real cost lower still, but the brief's generic $0.001 figure is the more conservative, provider-agnostic case, and the one worth designing the budget guard against.)

$50/day is a ceiling to degrade before, not hit. BE-9's budget guard — widen TTL and cadence as spend nears the cap, never hard-stop — is scoped out of this MVP by the brief's own instruction ("nice-to-have if time allows, not core to grading"), but `signal_readings.provider`/`fetch_status` already give a guard the exact visibility it would need to decide when to slow down; adding it later is additive, not a redesign.

## Extending to other event/trigger-based signals

The stretch question the domain model is built to answer: what changes to add a cricket-score trigger, a stock-index trigger, an AQI trigger, or a traffic trigger? The honest answer, checked against the actual code rather than asserted: **the decision engine, the freshness gate, dwell, override precedence, the transition log, and every dashboard view need zero changes.** Concretely, here's what adding one looks like — walking through a cricket-match trigger for a beverage brand that wants a celebratory creative when the home team is winning:

1. **One row in `signal_types`**: `{ name: "cricket.match_state", provider: "cricket-api", schema: {...} }`. This is data, not a migration to the decision path.
2. **One new adapter file**, mirroring `src/lib/weather/provider.ts`'s shape (`fetch(location) -> reading`) — the same seam BE-8 already uses to keep WeatherAPI.com swappable. A cricket adapter returns e.g. `{ home_win_probability: 0.82 }`.
3. **One new bindings row**: `{ creative: "Victory Chiller", priority: 75, predicate: { signal_type: "cricket.match_state", field: "home_win_probability", op: ">=", value: 0.7 } }`. Priority slots it into the existing precedence order alongside rain (100) and heat (50) — the multi-signal conflict case (two triggers disagree) is already handled, because every binding across every signal type is ranked on the same Priority field and the engine just takes the highest satisfied one, generically.
4. **The one real piece of work**: `src/lib/signals/ingest.ts` today loops over locations and calls the weather adapter by name (`ingestLocation` hardcodes `weather.precip`/`weather.temp`). Generalizing `ingestAll()` to loop over a small registry of adapters keyed by `signal_type` — instead of one hardcoded call — is the actual, bounded piece of new code. Everything downstream of a written `signal_reading` (engine, UI, log) already treats `signal_type` as an opaque string key.

Nothing in `decide()` (`src/lib/decision/engine.ts`) mentions weather by name — it reads `snapshot[predicate.signal_type].value[predicate.field]` and compares against `predicate.value`. The freshness gate, dwell suppression, and the reason schema all iterate `requiredSignalTypes(bindings)` generically, so a cricket-derived stale reading fails safe exactly like a weather one, and a suppressed cricket flip shows in history with the same `dwell_suppressed` flag. The portfolio card's "why" line and the location meter render `field`/`op`/`value` directly from whatever binding fired — no new copy layer, no per-signal-type UI work. A second signal type is, by construction, a config change plus one adapter file, not an engine rewrite — the claim Section 13's tradeoff #2 makes, checked against the code rather than asserted.

## Open question for the walkthrough

Whether the downstream ad server is real-time or caches/lags is a fact about a system this brief never specifies, and DynaMo can't determine it unilaterally — only make its own freshness explicit (`state_effective_as_of`) and let the consumer decide what "stale" means on its side. Raised here as a live question, not a solved one.
