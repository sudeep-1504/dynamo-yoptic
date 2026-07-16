# DynaMo — 60-Minute Walkthrough: Run of Show

Personal prep material, not a graded deliverable. Built from what CLAUDE.md and DynaMo_PRD.md establish about how the walkthrough is meant to run: driven entirely by the manual "run cycle now" trigger plus condition injection, not by waiting on the real clock — and the ad-server timing assumption is meant to be raised *live* as a genuine open question, not just written down.

**Live system:** `https://dynamo-yoptic.vercel.app` — CoolSip → Summer Campaign → Bangalore / Chennai / Delhi / Mumbai.

---

## Presentation pointers (how to come across well, not just correct)

- **Narrate the "why" before or while you click, not after.** The whole product's value proposition is visibility — if you click first and explain second, you're demoing a UI, not the trust story.
- **Lead with the three-word pitch before touching the screen:** *safe by default, visible always, human wins.* Everything you show for the next 55 minutes is one of those three ideas made concrete.
- **Show, then explain — don't read the write-up out loud.** Have it open in a second tab as your safety net for exact wording, but talk from the product and the code, not from the document.
- **Raise the open question yourself.** Don't wait for someone to ask whether the ad server is real-time or cached. Bring it up unprompted around minute 45 — per the brief's own framing, asking is a positive signal, not an admission of a gap.
- **If a live demo hiccups, don't panic — fall back to the transition log as proof.** The log is append-only evidence of what happened; if a click doesn't render instantly, refresh and point at the log entry instead of re-clicking anxiously.
- **Own the known platform quirk instead of hoping nobody notices it.** The background loop is scheduled daily right now (a Vercel Hobby-plan cron limit), not every 10 minutes. If it comes up: state it plainly, then point out this is exactly why the manual "run cycle now" trigger exists and runs the *identical* pipeline function — that was a deliberate design decision (P0-11), not a workaround improvised after the fact.
- **Keep a visible timer.** 60 minutes disappears fast once questions start. The agenda below has slack built into the Q&A block at the end, not in the middle — protect the live-rehearsal block (minutes 18–33) above all else, since that's the actual proof, not just narration.
- **Have the injection values below written down or copy-pasteable.** Don't compute thresholds live on stage.

---

## Before you start — setup checklist

- [ ] Log in as an internal admin (not a client-scoped user), so you can see the client picker and every write control.
- [ ] Open the app in one tab, this document in a second tab, the code editor (or GitHub) in a third.
- [ ] Release any lingering overrides from previous testing so the override banner is clean at the start (optional — the demo works either way, but a clean start reads better).
- [ ] Do one full dry run of the rehearsal steps below, same day if possible, so you know exactly how many clicks and how long each step takes on the real, currently-deployed app.

---

## Minute-by-minute agenda

### 0:00–0:04 — Framing (4 min)
- One-sentence pitch: "DynaMo decides which ad is eligible per city from live signals, and makes sure that decision is always safe, always explained, and always overridable by a human."
- State the three principles up front: safe by default, visible always, human wins.
- Preview the agenda in one breath so the room knows what's coming: product tour, then a live proof of the trust mechanics, then architecture, then tradeoffs/edge-cases/scale/extensibility, then open questions.

### 0:04–0:18 — Live product tour (14 min)
1. **Home / Clients grid** — internal users see clients hidden behind a click; a client user would land directly on their own dashboard instead. Point this out as the client-agnostic design choice.
2. **Click CoolSip → campaign picker** — mention this is where multi-campaign support lives; CoolSip has one campaign today (Summer Campaign) so it auto-skips straight through, but a second campaign would show a picker here instead.
3. **Portfolio grid** — the "trust glance." Walk one card: status chip (Auto/Fallback/Override/Paused), current creative, live signal summary, one-line why, data age. Say explicitly: "this answers 'is anything wrong' without a single click."
4. **Click into one city (Mumbai) → location detail / live meter.** Point at the left-to-right layout: signal → rule fired → creative. Data age and provider are always visible, never behind a click.
5. **History page** — filter by source, point out that suppressed dwell flips are shown here too, not hidden, so the anti-flicker behavior is auditable rather than just claimed.
6. **Thresholds page** — show the campaign-wide default plus a per-location override, and explain the real problem it solves (a heat threshold tuned for Delhi under-firing for a cooler city).
7. **Force an override on one city (Chennai)** — pick a creative, click Force. Point at the banner appearing immediately, loudly, across every screen — then click Release to show the one-click handback.

### 0:18–0:33 — Live rehearsal: proving the trust mechanics (15 min)
This is the actual proof, not narration — protect this block's time above all else.

**Step A — Fail-safe (fallback on missing/broken data), on Delhi:**
1. Open Delhi's location detail page → "Condition injection (demo)" card → click **Inject failure**.
2. Go back to the portfolio (or Delhi's page) → click **Run cycle now**.
3. Show Delhi flip to **Fallback** (amber), reason reads "Safe mode: weather data unavailable," staleness flag set.
4. Open History → point at the transition row: `decision_source: fallback`, `staleness_flag: true`, `dwell_suppressed: false` (fail-safe always bypasses dwell — say this explicitly).

**Step B — Dwell suppression (anti-flicker), on Mumbai:**
1. Mumbai's location detail → Inject reading: `precip_now = 0.25`, `apparent_temp = 20` → **Run cycle now**. Mumbai flips to the rain creative (rain fires, heat doesn't). This starts Mumbai's 20-minute dwell clock.
2. Immediately after, inject a new reading: `precip_now = 0.05`, `apparent_temp = 36` → **Run cycle now** again. Rain is no longer satisfied; heat now is — but heat's priority (50) is *lower* than rain's (100), so this is exactly the "flicker toward a lower-priority context creative" case the dwell rule is built to catch. Mumbai **holds on the rain creative** instead of flipping to heat.
3. Open History → show the suppressed row: `dwell_suppressed: true`, the why text reads "Held 'Rainy day pick-me-up' — flip to 'Beat the heat' suppressed (dwell 20m)."
4. Say the asymmetry out loud: a move *back to the safe default*, or a move to something *more urgent* (e.g. dry suddenly turning to rain), would have applied immediately — only this specific low-stakes, same-tier flicker gets held.

**Step C — quick override recap (if time):** re-force Chennai, show it in the portfolio's Override count, release it.

### 0:33–0:43 — Architecture and code (10 min)
- Sketch the schema verbally: advertisers → campaigns → creatives/bindings → locations/signal_types/signal_readings (shared, keyed by location not tenant) → line_items → transitions (append-only, RLS-enforced) → overrides.
- Open `src/lib/decision/engine.ts`'s `decide()` function. Walk the six steps in the code, matching exactly what was just demoed: override → freshness gate → predicate evaluation by priority → asymmetric dwell → write + log.
- Make the one sentence that matters land clearly: **the engine never mentions "weather" anywhere** — it reads `signal_type`/`field`/`value` generically. This sets up the extensibility section.

### 0:43–0:53 — Tradeoffs, edge cases, scale, and the stretch answer (10 min)
Work from `WRITEUP.md` as talking points, not read verbatim:
- **Three tradeoffs**: fail-safe strictness over uptime; a signal-agnostic seam instead of a full no-code rules editor; a shared signal cache across tenants instead of full isolation.
- **Three edge cases handled badly today**: mid-impression flips, one flaky poll looking identical to a real outage, one weather point standing in for an entire metro — each with its stated fix.
- **Scale math, stated plainly**: 200 cities × 10-minute cadence ≈ 28,800 calls/day ≈ $28.80, under the $50/day cap, because signal reads are per-city, not per-line-item — 200 cities is 200 lookups whether 12 or 10,000 line items sit behind them.
- **The stretch answer**: sketch the abstraction on a whiteboard or verbally — `signal_types → signal_readings → bindings → decide()` — then walk the concrete cricket-boundary example: one new `signal_types` row, one new adapter file, one new `bindings` row, and *nothing else changes*, checked against the actual `ingestAll()`/`decide()` code rather than asserted.

### 0:53–0:60 — Open question and wrap (7 min)
- **Raise it yourself, proactively:** "One thing I want to flag as a genuinely open question, not something I've quietly assumed my way past — whether the downstream ad server is real-time or caches/lags. I designed against the conservative case (assume it caches, always pair state with a timestamp) because the cost of being wrong that way is one unused field, versus a silent trust failure if I'd assumed the opposite and been wrong. But I can't actually verify which is true from my side, and I'd want to ask that directly of whoever owns that system."
- Recap the three principles once more, tie back to what was just proven live (not just claimed).
- Invite questions. Have the repo, the write-up, and the deployed URL ready to share if asked.

---

## Injection cheat-sheet (exact values, so nothing is computed live)

| Step | City | Action | Values | Expected result |
|---|---|---|---|---|
| Fail-safe | Delhi | Inject failure | — | Fallback (amber), staleness_flag true, dwell_suppressed false |
| Dwell #1 | Mumbai | Inject reading | precip_now `0.25`, apparent_temp `20` | Switches to rain creative; dwell clock starts |
| Dwell #2 | Mumbai | Inject reading (right after #1) | precip_now `0.05`, apparent_temp `36` | Holds on rain creative; dwell_suppressed true in History |
| Override | Chennai | Force creative → any creative → Force | — | Banner appears immediately, status = Override |
| Release | (banner) | Release | — | Banner clears, city returns to auto on next cycle |

Remember: injecting a reading only writes the fake signal — it does nothing until **Run cycle now** is clicked afterward.
