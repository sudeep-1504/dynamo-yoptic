# DynaMo — Explained Simply

This is the same write-up as before, but written in very plain English. It explains every database table, why it exists, how its fields get used, all the big decisions and why they make sense, and how to make DynaMo work for completely different events — not just weather.

---

## 1. What DynaMo Actually Does

Think of DynaMo like a smart billboard manager.

CoolSip (a cold-drinks brand) has three ads (we call them "creatives"):
- "Rainy day pick-me-up" — a hot drink ad, for rainy weather
- "Beat the heat" — an iced drink ad, for hot weather
- "Refresh anytime" — a plain, safe ad that works for anyone, anytime

DynaMo's job: look at the weather in each city, right now, and decide which one of these three ads should be showing in that city. If it starts raining in Mumbai, switch Mumbai to the rain ad. If Delhi is baking hot, switch Delhi to the heat ad. If nothing special is happening, or if DynaMo isn't sure, show the safe "anytime" ad.

Every single time it makes this choice, it writes down **why** — like a diary entry — so nobody has to guess later why an ad changed.

---

## 2. The Database — Every Table Explained

A database is just a set of labeled boxes where we keep information. Here is every box DynaMo has, what real-world thing it stands for, and what each field inside it means.

### `advertisers` — "Which company are we running ads for?"

Real-world meaning: one row = one client, like CoolSip.

| Field | What it means |
|---|---|
| `id` | A unique tag for this client, so other tables can point to it |
| `name` | The client's name, e.g. "CoolSip" |
| `created_at` | When this client was added |

Why it exists: DynaMo isn't just for CoolSip — it's built so any number of clients can use it. This table is simply the list of "who are our clients."

### `campaigns` — "Which specific ad campaign, for which client?"

Real-world meaning: one row = one campaign, like "Summer 2026" for CoolSip. A client can run more than one campaign at a time (e.g. one for summer, one for a new product launch).

| Field | What it means |
|---|---|
| `id` | Unique tag for this campaign |
| `advertiser_id` | Points back to which client owns this campaign |
| `name` | The campaign's name |
| `dwell_minutes` | How long to wait before flipping ads back and forth too quickly (explained in Section 4) |
| `created_at` | When the campaign was created |

Why it exists: everything else — the ads, the rules, the history — belongs to one campaign. A campaign is the "container" that groups them together.

### `creatives` — "The actual ads themselves"

Real-world meaning: one row = one ad asset (a picture, a video, whatever gets shown).

| Field | What it means |
|---|---|
| `id` | Unique tag for this ad |
| `campaign_id` | Which campaign this ad belongs to |
| `name` | The ad's name, e.g. "Beat the heat" |
| `role` | Either `"context"` (a special-situation ad, like the rain one) or `"default"` (the safe, always-fine ad) |
| `created_at` | When it was added |

Why it exists: DynaMo needs to know about every ad it *could* show, before it decides which one *should* be showing.

### `locations` — "The cities we're targeting"

Real-world meaning: one row = one city, like Mumbai or Delhi.

| Field | What it means |
|---|---|
| `id` | Unique tag for this city |
| `name` | City name |
| `lat`, `lng` | The city's exact map coordinates, set once and never re-guessed — this is what we send to the weather service to ask "what's the weather here?" |
| `created_at` | When it was added |

Why it exists: cities are shared, reference information — like a phone book. Every client that wants to target Mumbai uses the exact same Mumbai row, instead of each client having their own separate copy of "Mumbai."

### `signal_types` — "What kinds of real-world facts can DynaMo react to?"

Real-world meaning: one row = one *category* of live information, like "current rain" or "current temperature." This table is the reason DynaMo isn't stuck being a weather-only tool (more on this in Section 5).

| Field | What it means |
|---|---|
| `id` | Unique tag |
| `name` | A short code name, e.g. `"weather.precip"` (rain) or `"weather.temp"` (temperature) |
| `provider` | Which outside service this fact comes from, e.g. "WeatherAPI.com" |
| `schema` | A description of what shape the data looks like (kept flexible on purpose, stored as free-form data) |
| `created_at` | When it was added |

Why it exists: instead of hard-coding "weather" into DynaMo's brain, we made "a live fact DynaMo can check" into its own labeled box. Adding a brand-new kind of fact later (like "is the home cricket team winning?") means adding one new row here — not rewriting the program.

### `signal_readings` — "The actual live numbers, saved with a timestamp"

Real-world meaning: one row = one snapshot, like "In Mumbai, at 3:05pm, it was raining 1.2mm/h, according to WeatherAPI.com."

| Field | What it means |
|---|---|
| `id` | Unique tag |
| `location_id` | Which city this reading is about |
| `signal_type_id` | Which kind of fact this is (rain? temperature?) |
| `value` | The actual number(s), e.g. `{ "precip_now": 1.2 }` |
| `read_at` | The exact moment this was true — this is how DynaMo knows if a reading is "fresh" or "old" |
| `provider` | Which service gave us this number |
| `fetch_status` | `"ok"` (worked fine), `"failed"` (the fetch broke), or `"injected"` (a human faked this reading on purpose, for testing) |
| `created_at` | When this row was saved |

Why it exists: this is DynaMo's memory of "what did we last know, and when." Every decision DynaMo makes looks at the newest row here for each city and fact. If the newest row is too old (more than 15 minutes), DynaMo treats it as "we don't actually know" and plays it safe (see Section 4).

One important design choice: a reading is saved **per city**, not per client. If both CoolSip and a second client both target Mumbai, they share the exact same weather reading — because Mumbai's weather is one true fact, not a separate fact for each client. This keeps costs low (one weather check covers everyone) and is explained more in Section 4.

### `bindings` — "The rules: which ad goes with which situation?"

Real-world meaning: one row = one rule, like "IF it's raining more than 0.2mm/h, THEN show the rain ad."

| Field | What it means |
|---|---|
| `id` | Unique tag for this rule |
| `campaign_id` | Which campaign this rule belongs to |
| `creative_id` | Which ad this rule points to, if it wins |
| `predicate` | The actual condition, saved as data, e.g. `{ signal_type: "weather.precip", field: "precip_now", op: ">", value: 0.2 }` — in plain words: "check the rain reading's precip_now number, and see if it's greater than 0.2" |
| `priority` | A number that says how important this rule is if more than one rule is true at once. Bigger number wins. `0` is always reserved for the safe "default" rule, which is always true, guaranteeing there's always a winner |
| `trigger_type` | A short label for what kind of rule this is, e.g. `"weather.precip"` |
| `created_at` | When it was added |

Why it exists: this is the actual "brain" of the campaign, but written as **data**, not as hard-wired computer code. That's the single most important design choice in DynaMo (explained fully in Section 5) — because a rule stored as data can be added, changed, or replaced without anyone touching the underlying program.

### `binding_overrides` — "A different number for one specific city"

Real-world meaning: normally, "hot" means the same temperature everywhere (say, 35°C). But Bangalore rarely gets that hot, even in summer — so its "beat the heat" ad might almost never show, not because the rule is wrong, but because the number was never right for that city. This table lets one city use its own number instead of the campaign's normal number.

| Field | What it means |
|---|---|
| `id` | Unique tag |
| `binding_id` | Which rule this override replaces, for one city |
| `location_id` | Which city gets the special number |
| `predicate` | The replacement condition, just for that city |
| `created_at` | When it was added |

Why it exists: without this table, a campaign would need one global number that's wrong for at least some cities. With it, Delhi can use 35°C while Bangalore uses 30°C, without needing two separate campaigns.

### `line_items` — "One ad, in one city, and whether it's currently live"

Real-world meaning: one row = "is the 'Beat the heat' ad currently switched ON in Delhi, or OFF?"

| Field | What it means |
|---|---|
| `id` | Unique tag |
| `creative_id` | Which ad |
| `location_id` | Which city |
| `state` | `"active"` (currently showing) or `"paused"` (currently not showing) |
| `bid`, `daily_budget` | Money-related fields for the ad auction system. DynaMo stores these but doesn't use them to make decisions yet — that's a job for a different part of the system, later |
| `last_state_change_at` | The exact time this ad last turned on or off in this city — this is what the "don't flip too fast" rule (Section 4) checks against |
| `created_at` | When it was added |

Why it exists: this is the actual switch DynaMo flips. Everything before this table (rules, readings) is DynaMo *thinking*. This table is DynaMo *acting* — exactly one ad should be "active" per city at a time, all others "paused."

### `transitions` — "The permanent diary of every decision ever made"

Real-world meaning: one row = one entry saying "at this exact time, in this city, the ad changed from X to Y, and here's exactly why."

| Field | What it means |
|---|---|
| `id` | Unique tag |
| `location_id`, `campaign_id` | Which city and campaign this entry is about |
| `from_creative_id`, `to_creative_id` | What was showing before, and what's showing now |
| `decision_source` | `"auto"` (the system decided on its own), `"fallback"` (safe mode, data was missing), or `"override"` (a human forced it) |
| `trigger_type` | Which kind of rule caused this |
| `rule_fired_name`, `rule_fired_priority` | The name and importance-number of the rule that won |
| `signal_snapshot` | A saved copy of exactly what the live readings looked like at that moment, including how old they were and which service they came from |
| `staleness_flag` | `true` if this decision was made because data was too old |
| `dwell_suppressed` | `true` if DynaMo *wanted* to flip the ad but held off because it would have been too soon (Section 4) |
| `state_changed` | Whether the ad actually changed, or stayed the same |
| `created_at` | The timestamp of this diary entry |

Why it exists: this is DynaMo's proof. Nobody has to trust DynaMo blindly — every single change, and even every change it *chose not to make*, is written down permanently. This table is set up so that **rows can only be added, never edited or deleted** — even by an admin, even by accident. That's what makes it a trustworthy record instead of just a log that could quietly be changed later.

### `overrides` — "A human stepping in and taking control"

Real-world meaning: one row = "a person manually forced a specific ad (or paused everything) for a city or a whole campaign."

| Field | What it means |
|---|---|
| `id` | Unique tag |
| `location_id` | If set, this override applies to just one city |
| `campaign_id` | If set (and no city given), this applies to the whole campaign |
| `forced_creative_id` | The ad a human is forcing to show, if any |
| `is_paused` | `true` if a human paused this city/campaign entirely — no ad shows |
| `actor` | Who did this (a name or email) |
| `created_at` | When they did it |
| `expires_at` | Optional: when this override automatically stops applying |
| `released_at` | When someone manually cancelled it early |

Why it exists: no matter how smart the automatic rules are, a human must always be able to say "no, I know better right now, show this ad" — and that decision must always beat the computer's own logic. This is the most important rule in the whole system: **a human's decision always wins over the automatic one.**

### `profiles` — "Who's allowed to log in, and what can they do?"

Real-world meaning: one row = one person with an account.

| Field | What it means |
|---|---|
| `id` | Matches this person's login account |
| `email`, `display_name` | Who they are |
| `role` | `"internal"` (someone from the DynaMo team) or `"client"` (someone from CoolSip or another client) |
| `is_admin` | `true` means they can make changes (force an ad, pause a city); `false` means they can only look |
| `advertiser_id` | If they're a client user, which client they belong to (an internal user isn't tied to just one client) |
| `invited_by` | Who created this account |
| `created_at` | When the account was made |

Why it exists: not everyone should be able to touch every client's campaigns, and not everyone who can *see* something should be able to *change* it. This table is what keeps that straight.

---

## 3. How DynaMo Decides — Step By Step

Every few minutes (or whenever someone clicks "run cycle now"), for every city, DynaMo goes through the same six steps, in this exact order:

1. **Did a human take over?** If someone set an override for this city (or the whole campaign), that wins, no matter what. Full stop.
2. **What do we currently know?** Pull the newest saved readings (rain, temperature) for this city.
3. **Is that information still fresh?** If a needed reading is missing, broken, or older than 15 minutes, DynaMo doesn't guess — it plays it safe and shows the "anytime" ad, and writes down "data was stale."
4. **Which rule applies?** Check every rule for this campaign. If more than one is true at once (e.g. it's both raining and hot), the rule with the bigger priority number wins. There's always a fallback: the "always true, priority 0" rule guarantees some ad is always chosen.
5. **Is it too soon to switch?** If the winning ad is different from what's currently showing, DynaMo checks: has it been at least 20 minutes since the last change? If not, and if this isn't a "safety" situation, it holds the current ad instead of flip-flopping, and writes down "we suppressed this flip." (Two exceptions always apply immediately, even if it's "too soon": switching to the safe default ad always happens right away, and switching to a genuinely *more urgent* situation — like dry weather suddenly turning to rain — always happens right away too. Only low-stakes back-and-forth flickering gets held.)
6. **Make it real, and write it down.** Turn on the winning ad, turn off all the others for that city, and add one permanent row to the `transitions` diary explaining exactly what happened and why.

---

## 4. The Big Decisions — Explained Simply

**Why Supabase instead of Airtable?**
Airtable is easy to set up, almost like a spreadsheet. But anyone with access could quietly edit an old diary entry in Airtable — and the whole point of the `transitions` table is that it can *never* be secretly changed. Supabase (a real database) lets us technically lock that table so even an admin literally cannot edit or delete old rows by accident. Trust needed a real lock, not just a polite request not to touch it.

**Why WeatherAPI.com instead of a free alternative?**
There's a free weather service (Open-Meteo) that's even easier to use, but its rules say you can't use it for anything commercial, like ads. WeatherAPI.com's rules clearly allow commercial use on its free plan, and it happens to also hand back both "right now" weather and an hourly forecast in a single request, which is convenient. So it's the only option that's both legally safe and practically useful.

**Why does missing data mean "play it safe" instead of "keep the last known ad"?**
Imagine you're not sure if it's raining, so instead of guessing, you just wear your everyday shoes instead of picking rain boots or sandals. DynaMo does the same thing: if it isn't confident in the data, it shows the safe "anytime" ad rather than betting on a rule that might now be wrong. The tradeoff: even one bad or slow weather check for a few minutes can bump a city into "safe mode" for a bit — but a wrong drink ad in the wrong weather is a worse outcome than a boring-but-safe ad for a few minutes.

**Why check freshness every 15 minutes?**
Weather doesn't change instantly, so DynaMo doesn't need to check every second — that would be wasteful and would cost more money in weather-service calls. But it also can't wait too long, or it'll be showing an ad based on weather from hours ago. 15 minutes was picked as a comfortable middle ground: fresh enough to feel "live," relaxed enough to be cheap.

**Why share one weather reading across all clients targeting the same city?**
Weather in Mumbai is one true fact — it doesn't change depending on which company is asking about it. So instead of every client separately paying to ask "what's the weather in Mumbai?", DynaMo asks once, saves the answer, and every client targeting Mumbai reads that same saved answer. This is what keeps costs low even as more clients and cities are added — a handful of weather checks now covers everyone, not one check per client.

**Why assume the ad-serving system is "a little bit behind" instead of instantly live?**
This is the same idea as texting someone a photo instead of them watching over your shoulder live. If we assume the ad system checks in every so often (rather than watching every instant), the cost of being wrong is tiny — we just wrote a timestamp nobody strictly needed. But if we assumed the opposite — that it's instantly live — and we were wrong, the ad system could keep showing an old, wrong ad for a while with nobody realizing it, because we never bothered to say how old our answer was. So DynaMo always stamps every answer with "this was true as of this exact time," which works safely either way.

**Why wait 20 minutes before flipping an ad back and forth (the "dwell" rule)?**
Imagine rain sensors flicker between "just barely raining" and "just barely not raining" for ten minutes straight. Without a rule against it, the ad would flip back and forth every couple of minutes, which looks broken and confusing. So DynaMo holds its current ad steady for at least 20 minutes before allowing a "same-importance" flip-flop — but it never holds back a *genuinely urgent* change, like actual heavy rain starting, or a move back to the safe default ad. Those always happen immediately. Only the flickery, low-stakes kind of change gets delayed.

**Why let one city have its own special number (per-location threshold override)?**
A "hot day" isn't the same everywhere. 35°C is scorching in Delhi but barely notable in some coastal cities. Using one single number for every city means it'll be right for some cities and simply wrong for others — not because of a bug, but because nobody tuned it. Letting one city override the number, without needing a whole separate campaign just for that city, fixes this cheaply.

**Why store money fields (bid, budget) but not use them yet?**
The brief asked us to track them so the system's shape is ready for later, but explicitly said not to build the logic that spends money based on them yet. So the fields exist and are saved, but no decision in this version reads them. Building that logic properly (auction bidding, daily spend limits) is a bigger, separate piece of work saved for later.

---

## 5. Making DynaMo Work For Any Kind of Event (Not Just Weather)

This is the most important design idea in the whole system: **DynaMo's actual decision-making code never once mentions the word "weather."** It only ever asks: "check this named fact, on this field, with this comparison, against this number." Weather just happens to be the first fact we plugged in.

That means adding a totally new kind of trigger — a cricket match, a football result, a stock market crash, anything — always needs exactly the same three ingredients, and nothing else:

1. **One new row in `signal_types`** — just naming the new kind of fact, e.g. `"cricket.match_state"`.
2. **One new small program that fetches that fact** — a "translator" that asks some outside service "what's happening right now?" and saves the answer into `signal_readings`, in the same shape the weather one already uses.
3. **New rows in `bindings`** — new rules saying which ad should show when that new fact crosses some number, with a priority saying how important it is compared to other rules.

Everything else — the freshness check, the "don't flip too fast" rule, the permanent diary, the human-override system, and every screen in the dashboard — already works with *any* fact, because they were never written to only understand weather. They just read whatever `signal_type`, `field`, and `value` a rule happens to point at.

Here are three concrete examples:

### Example 1: Cricket — showing a "celebration" ad when the home team hits a boundary

- New `signal_types` row: `{ name: "cricket.match_state", provider: "cricket-score-api" }`
- A new small fetcher checks a live cricket-score service and saves something like: `{ last_ball_result: "boundary", home_team_run_rate: 8.4 }`
- A new `bindings` row: "IF `last_ball_result` equals `boundary`, THEN show the 'Celebrate with CoolSip' ad, priority 60"
- Result: the moment a boundary is hit, this rule becomes true, and — following the exact same steps as Section 3 — the ad switches, gets logged, and respects the same 20-minute anti-flicker and human-override rules automatically. Nothing about *how* the decision gets made changes at all.

### Example 2: Football (soccer) — reacting to a win or a loss

- New `signal_types` row: `{ name: "football.match_result" }`
- A fetcher saves: `{ result: "win" }`, `{ result: "loss" }`, or `{ result: "draw" }` after a match ends
- Two new `bindings` rows: "IF `result` equals `win`, show the 'Victory Cooler' ad, priority 70" and "IF `result` equals `loss`, show a comforting 'Better luck, refresh anyway' ad, priority 65"
- Because both new rules have real priority numbers, and rain/heat rules keep their own numbers too, DynaMo automatically knows which one should win if, say, it's both raining *and* the home team just won — no extra work needed, because the "biggest priority number wins" logic already exists and doesn't care which kind of fact the rule came from.

### Example 3 (bonus): Air quality or a stock market crash

- Same recipe again: one `signal_types` row (e.g. `"env.aqi"` or `"market.index"`), one small fetcher, one or more `bindings` rows with a chosen priority.
- A mask or purifier brand could show a "protect yourself" ad when air quality crosses a bad number. A finance app could show a "steady advice" ad the moment a market index drops sharply. Same three ingredients, every time.

### What never has to change

No matter which of these gets added: the actual decision-making program, the freshness/safety check, the flip-flop protection, the permanent diary table, the human-override system, and every dashboard screen (the city grid, the live meter, the history page) all keep working exactly as they already do. They were built to read "some fact, some field, some number" generically — never "weather" specifically. Adding a new kind of trigger is closer to filling out a form than writing new code.

The one piece of real, honest work each time is step 2 — writing that one small fetcher program for the new outside data source. Everything downstream of it is already built to handle whatever that fetcher hands over.

---

## 6. Quick Recap — Every Decision, In One Line Each

- **Database:** Supabase, because it can truly lock the audit trail — Airtable can't.
- **Weather source:** WeatherAPI.com, because it's the only option that's both free and legally fine for ads.
- **Missing/old data:** always fall back to the safe default ad — never guess.
- **Freshness window:** 15 minutes — fast enough to feel live, slow enough to stay cheap.
- **Weather cache:** shared across every client targeting the same city — one fact, checked once.
- **Ad-server timing:** assumed to check in periodically, not instantly live — the safer guess either way, always paired with a timestamp.
- **Anti-flicker (dwell):** hold steady for 20 minutes on low-stakes flips; genuinely urgent changes and the safe default always apply immediately.
- **Per-city thresholds:** one campaign-wide number by default, with the option to give one city its own number.
- **Money fields (bid/budget):** stored for the future, not used in decisions yet.
- **Human override:** always wins over every automatic rule, no exceptions.
- **Extensibility:** any new kind of live event needs only one new signal type, one small fetcher, and new rule rows — the decision-making logic, safety checks, diary, and screens never need to change.
