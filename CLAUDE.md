# DynaMo MVP — Build Brief

Context-aware ad decisioning for CoolSip (4 cities × 3 creatives). Full reasoning lives in DynaMo_PRD.md in this repo (source of truth for "why"). This file is the condensed "what to build" for implementation.

Time budget: 12–16 hours. Stop at 16 regardless of state. Build order below matches that budget.

## Stack (locked, do not re-litigate)
- DB: Supabase Postgres. Rejected Airtable — can't enforce append-only on the transition log, and its 5 req/sec API cap contradicts the 200-city scale story.
- Weather provider: WeatherAPI.com. Rejected Open-Meteo (free tier ToS excludes ad-serving/commercial apps). WeatherAPI.com's pricing page shows Commercial Use permitted on Free (100k calls/month). Provider sits behind an interface — swappable, don't hardcode field names outside one adapter module.
- Deploy: Vercel (assumed; confirm if repo owner prefers otherwise).
- Auth: Supabase Auth, invited-user allowlist only, no role granularity for MVP.

## Schema (entities, not exhaustive DDL — derive types from usage below)
- `advertisers`, `campaigns`, `creatives` (role: context | default), `locations` (lat/lng fixed at setup, never re-geocoded by name per-request)
- `signal_types` (name, provider, schema)
- `signal_readings` (location_id, signal_type_id, value, read_at, provider, fetch_status) — shared across tenants, keyed by (location, signal_type), NOT per-campaign
- `bindings` (campaign_id, creative_id, predicate, priority) — priority 0 reserved for the default/always-true binding, enforce at save-time that every location has one (silent gap otherwise)
- `line_items` (creative_id, location_id, state: active|paused, bid, daily_budget) — bid/budget stored, NOT read by the decision engine in MVP
- `transitions` — INSERT-ONLY. Row-level security: no UPDATE, no DELETE grant to any role. This table is the entire audit/trust story, do not compromise it for convenience.
- `overrides` (location_id or campaign_id, forced_creative_id | is_paused, actor, created_at, expires_at nullable, released_at nullable)

## Decision pipeline (pure function, unit test before wiring to DB)
Input: location_id + current line_item states + cached signal_readings. Output: winning creative + structured reason. Never mutates state itself — a thin wrapper applies the result.

```
1. Override check — active override? → resolve to override target, log if changed, STOP.
   (Override outranks everything below, including fallback.)
2. Signal snapshot — read cached SignalReadings for location, note age + provider per reading.
3. Freshness gate — any required signal missing/failed/older than 15min tolerance?
   → resolve to DEFAULT creative, flag stale, log, SKIP dwell (fail-safe bypasses dwell), STOP.
4. Predicate evaluation — evaluate all bindings' predicates against snapshot.
   Highest priority satisfied predicate wins. Priority-0 (always_true) guarantees a winner.
5. Dwell check (asymmetric, 20min default window, config per campaign):
   - Bypass dwell (apply immediately) if: winner is the default creative, OR winner is a
     STRICTLY HIGHER priority than current (e.g. dry→raining while raining starts).
   - Otherwise, if <20min since last state change: HOLD current state, log dwell_suppressed=true.
6. Write + log — set winner active, all other creatives at that location paused,
   append transition row with full reason schema below.
```

CoolSip decision table (config, not code):
| priority | creative | predicate |
|---|---|---|
| 100 | Rainy day pick-me-up | precip_now > 0.2mm/h |
| 50 | Beat the heat | apparent_temp >= 35°C |
| 0 | Refresh anytime | always true |

Threshold notes: current precip, NOT "any precip in last hour" (brief's literal wording over-fires). apparent_temp (feels-like), NOT raw air temp (humidity matters, esp. Chennai). Both are config values (per-campaign, optionally per-location override — model must support the override even if MVP ships one global number, see PRD Section 14 edge case #2).

Transition reason schema (render this directly in the UI, no separate copy layer):
```
timestamp, location, campaign, from_creative, to_creative,
decision_source: auto | fallback | override,
trigger_type, rule_fired (name + priority),
signal_snapshot (values + reading age + provider),
staleness_flag, dwell_suppressed (bool)
```

## Signal ingestion
- Fetch keyed by (location, signal_type), cached to 15-min TTL, shared across campaigns (not per-line-item, not per-tenant — weather in Mumbai is one fact).
- Pull the hourly forecast in the same call as current conditions (WeatherAPI.com returns both). Use ONLY to schedule polling density (wider gaps in flat stretches, tighter around forecast transition windows) — forecast NEVER enters the decision predicate, only live readings do.
- Background loop: 10-minute cadence. ALSO build a manual "run cycle now" endpoint calling the identical pipeline function — this drives the walkthrough demo, not the scheduled loop. Same code path, not a separate demo-only version.
- Consumer API for downstream ad-server: always pair current state with `state_effective_as_of` timestamp. Assume the ad server caches/lags rather than reads real-time — conservative assumption, cheap if wrong.
- Condition injection: an admin endpoint/toggle to write a fake signal_reading for a location, bypassing the real fetch. Needed to demo working + breaking on cue.

## Frontend (3 views, in build-priority order)
1. **Portfolio overview** — grid, one card per location: current creative, status chip (Auto/Fallback/Override/Paused), live signal summary, one-line "why", data age. Highest value, lowest effort — build first.
2. **Location detail (the live meter)** — signal → rule fired → live creative, left to right, updating every cycle. Data age + provider always visible. Force-creative / pause-city controls live here.
3. **History** — filterable transition log (by location, date, source). Suppressed dwell flips shown, not hidden. Last 20–50 rows per location.
4. Persistent override banner across all views — loud, actor + time + expiry, one-click release.
Empty/error/stale states: never a blank grid or a spinner masking a stale value — always an explicit label.

Skip custom styling. Functional and legible over polished and late.

## Explicitly OUT of MVP (do not build, do not scope-creep into)
- Budget pacing / bid logic (fields stored, ignored)
- Full no-code rules/bindings editor (bindings are configured directly, not authored via UI)
- Multi-tenant isolation beyond basic schema shape, granular roles
- Multi-trigger signal types (cricket/stocks/AQI/traffic) — architecture supports it, don't implement
- Ad serving/auction, mid-impression handling, minute-to-minute streaming
- Budget guard degradation logic (BE-9) — nice-to-have if time allows, not core to grading

## Build order (matches the 12-16hr budget)
0. Setup (30min): Supabase schema + RLS on transitions (insert-only), WeatherAPI.com key + confirm ToS at signup.
1. Core loop backend (5-6hr): seed line_items from CSV → signal fetch (isolated test) → decision engine (unit test with hand-fed snapshots BEFORE touching DB) → fail-safe/staleness → write+log → scheduled + manual trigger (same function).
   Checkpoint: manual trigger produces correct state + transition row, no UI yet. Don't proceed until solid.
2. Override + condition injection (1-1.5hr): override API wired into pipeline step 1, condition injection endpoint.
3. Dashboard (2-3hr): portfolio → location detail/meter → history → override controls, in that order.
4. Access gate + deploy (45min): Supabase Auth allowlist, confirm a fresh session actually works end to end.
5. Write-up (2hr): compress existing tradeoffs/edge-cases/stretch-answer (already drafted in DynaMo_PRD.md Sections 13-14) into the brief's 3-page/1500-word limit. This is compression, not new writing.
6. Rehearsal (1-1.5hr): inject null reading → run cycle → confirm fallback + correct reason. Inject a value oscillating near the rain threshold across 2 cycles inside the 20min dwell window → confirm second flip suppressed and visible in history as suppressed.

If short on time at hour 16: cut dashboard polish and budget guard (BE-9) before cutting dwell, fail-safe, or the transition log. Those three are what the brief is actually grading.
