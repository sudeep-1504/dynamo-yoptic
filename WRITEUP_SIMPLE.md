# DynaMo — Explained Simply (Complete Version)

This document explains everything about DynaMo in plain English: who it's for, every database table and why it exists, how it makes decisions, what the screens look like, every big design decision and why it makes sense, what still doesn't work perfectly (said honestly, not hidden), what was deliberately left unbuilt, whether it holds up at real scale, and exactly how to extend it to completely different kinds of events, not just weather.

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

## 2. Who Actually Uses DynaMo

DynaMo isn't built for one kind of person. Four different "users" care about it, in different ways:

- **The brand lead (e.g. CoolSip's CMO).** Rarely opens the tool. Wants one thing above all: proof that the wrong ad never goes out. Needs a quick glance that says "everything's fine" or "here's exactly what's not," plus a big red "pause everything" button for emergencies.
- **The campaign operator (the person who actually runs the campaign day to day).** Lives inside the dashboard. Investigates why something changed, sets up rules, takes over manually when needed.
- **The DynaMo team itself (internal staff).** Cares about the health of the whole system across every client — is the weather service working, are costs under control, is anything broken.
- **The downstream ad server.** Not a person — a piece of software. It doesn't run the auction or decide what to show; it just asks DynaMo "which ad is eligible right now?" and DynaMo answers. DynaMo decides *eligibility*; something else entirely handles the actual ad auction and serving.

This matters because it explains why the product has two very different "modes": a boring, glanceable summary for someone who checks in once a week, and a detailed live view for someone who lives in it every day.

---

## 3. The Rules DynaMo Always Follows, No Matter What

Before getting into tables and code, here are the five rules that shape every decision DynaMo makes. Everything else in this document is really just these five ideas, applied:

1. **When unsure, play it safe.** If DynaMo doesn't trust its data, it never guesses — it shows the safe, generic ad instead of risking an embarrassing mismatch (like a hot-drink ad during a downpour).
2. **Always show your work.** Every single ad, at every moment, should be able to answer "why is this showing?" without anyone having to click around or ask an engineer.
3. **A human always outranks the machine.** If a person manually steps in, that decision wins over anything the automatic system would have picked — always, no exceptions.
4. **Don't just think about weather — think about "any live fact."** The system is built so that a new kind of trigger (cricket scores, football results, anything) slots in as new information, not as a rewrite of the program.
5. **Never make a silent change.** Every single time an ad switches — or even when DynaMo *considers* switching and decides not to — it gets written down permanently, with a reason.

---

## 4. The Database — Every Table Explained

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
| `dwell_minutes` | How long to wait before flipping ads back and forth too quickly (explained in Section 8) |
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

One honest limitation: one city = one single map point. A real city can have rain on one side and sun on the other at the same moment, and DynaMo can't see that difference — more on this in Section 9.

### `signal_types` — "What kinds of real-world facts can DynaMo react to?"

Real-world meaning: one row = one *category* of live information, like "current rain" or "current temperature." This table is the reason DynaMo isn't stuck being a weather-only tool (more on this in Section 12).

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
| `fetch_status` | `"ok"` (worked fine), `"failed"` (the fetch broke), or `"injected"` (a human faked this reading on purpose — explained just below) |
| `created_at` | When this row was saved |

Why it exists: this is DynaMo's memory of "what did we last know, and when." Every decision DynaMo makes looks at the newest row here for each city and fact. If the newest row is too old (more than 15 minutes), DynaMo treats it as "we don't actually know" and plays it safe (see Section 8).

One important design choice: a reading is saved **per city**, not per client. If both CoolSip and a second client both target Mumbai, they share the exact same weather reading — because Mumbai's weather is one true fact, not a separate fact for each client. This keeps costs low (one weather check covers everyone) and is explained more in Section 8.

**What's "injected" for?** Real weather doesn't wait around for a demo. So DynaMo has a side-door: an admin can manually write a fake reading straight into this table — "pretend it's raining 5mm/h in Mumbai right now" — without touching the real weather service at all. This exists purely so anyone showing off or testing DynaMo can prove, on command, that the rain ad switches on when it should, and that safe-mode kicks in when a reading is missing or broken — instead of having to sit around waiting for real rain.

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

Why it exists: this is the actual "brain" of the campaign, but written as **data**, not as hard-wired computer code. That's the single most important design choice in DynaMo (explained fully in Section 12) — because a rule stored as data can be added, changed, or replaced without anyone touching the underlying program.

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
| `bid`, `daily_budget` | Money-related fields for the ad auction system. DynaMo stores these but doesn't use them to make decisions yet — that's a job for a different part of the system, on purpose, explained in Section 10 |
| `last_state_change_at` | The exact time this ad last turned on or off in this city — this is what the "don't flip too fast" rule (Section 8) checks against |
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
| `dwell_suppressed` | `true` if DynaMo *wanted* to flip the ad but held off because it would have been too soon (Section 8) |
| `state_changed` | Whether the ad actually changed, or stayed the same |
| `created_at` | The timestamp of this diary entry |

Why it exists: this is DynaMo's proof. Nobody has to trust DynaMo blindly — every single change, and even every change it *chose not to make*, is written down permanently. This table is set up so that **rows can only be added, never edited or deleted** — even by an admin, even by accident. That's what makes it a trustworthy record instead of just a log that could quietly be changed later.

The history screen (Section 6) only ever shows the most recent 20 to 50 of these rows per city — enough to answer "why did this change eight times today," without turning into an unreadable wall of text.

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

Why it exists: not everyone should be able to touch every client's campaigns, and not everyone who can *see* something should be able to *change* it.

This is deliberately a thin, simple version. There's no public "sign up" page — every account is created by someone who already has access, on the honor system that they're vouching for the new person. There's also no long list of finely-grained permissions, just "internal or client" and "can change things, or can only look." A bigger, more detailed permission system (separate roles for a trafficker vs. a platform operator, for example) is a reasonable next step, just not one this version needed to prove the core idea works.

---

## 5. How DynaMo Decides — Step By Step

Every 10 minutes, automatically, in the background — or instantly, whenever someone clicks "run cycle now" — for every city, DynaMo goes through the same six steps, in this exact order:

1. **Did a human take over?** If someone set an override for this city (or the whole campaign), that wins, no matter what. Full stop.
2. **What do we currently know?** Pull the newest saved readings (rain, temperature) for this city.
3. **Is that information still fresh?** If a needed reading is missing, broken, or older than 15 minutes, DynaMo doesn't guess — it plays it safe and shows the "anytime" ad, and writes down "data was stale."
4. **Which rule applies?** Check every rule for this campaign. If more than one is true at once (e.g. it's both raining and hot), the rule with the bigger priority number wins. There's always a fallback: the "always true, priority 0" rule guarantees some ad is always chosen.
5. **Is it too soon to switch?** If the winning ad is different from what's currently showing, DynaMo checks: has it been at least 20 minutes since the last change? If not, and if this isn't a "safety" situation, it holds the current ad instead of flip-flopping, and writes down "we suppressed this flip." (Two exceptions always apply immediately, even if it's "too soon": switching to the safe default ad always happens right away, and switching to a genuinely *more urgent* situation — like dry weather suddenly turning to rain — always happens right away too. Only low-stakes back-and-forth flickering gets held.)
6. **Make it real, and write it down.** Turn on the winning ad, turn off all the others for that city, and add one permanent row to the `transitions` diary explaining exactly what happened and why.

**Why every 10 minutes, and why a manual button too?** Ten minutes comfortably fits inside the 15-minute "still fresh" rule, with a little room to spare, and keeps costs low (see Section 11). But a real demo or walkthrough shouldn't have to sit around waiting for the clock to tick — so there's also a manual "run cycle now" button that runs the *exact same* decision steps on demand, instantly. It's not a separate, simplified demo version; it's the identical machinery, just triggered by a click instead of a timer.

---

## 6. The Screens You Actually See

There are three main screens, plus one banner that follows you everywhere. They were built in this order, on purpose — cheapest to build, most useful first:

**1. The portfolio grid (the "everything's fine at a glance" screen).** One card per city, all on one page. Each card shows: which ad is showing right now, a colored status tag, the live weather numbers, a one-line reason why, and how old the data is. No clicking required to understand the whole campaign at once. The status tag is always one of:
- **Auto** (green) — running normally, on fresh data.
- **Fallback** (amber) — showing the safe default ad because data was missing or old. Labeled plainly, e.g. "Safe mode: weather data unavailable."
- **Override** (blue, loud) — a human forced this. Shows who and when.
- **Paused** (grey/red) — nothing is showing, because a human paused this city.

**2. The city detail screen (the "live meter").** Click into one city and see it laid out left to right: the live signal → the rule that fired → the ad currently showing, updating every cycle. Data age and which weather service it came from are always visible, never hidden behind a click. This is also where the "force a specific ad" and "pause this city" buttons live, right at the city someone's actually looking at.

**3. The history page (the audit trail).** A filterable list of the last 20–50 changes per city — filter by city, date, or whether it was automatic, fallback, or a human override. Suppressed flips (Section 8's "too soon to switch" rule) are shown too, not hidden, so the anti-flicker behavior can actually be checked, not just claimed.

**The override banner.** Shown across every screen whenever any override is active anywhere in the campaign — loud, impossible to miss, showing who forced it, when, and a one-click "release it back to automatic" button. The point: a forgotten override (a human forced something days ago and moved on) is a real risk, and this banner exists so it can never quietly go unnoticed.

**How empty or broken states are handled.** A brand-new campaign with no data yet never shows a blank page — it says plainly "awaiting first decision." A city whose weather check failed never just spins forever or silently shows old data as if it were current — it shows the fallback state with the actual reason. Nothing is ever allowed to look "fine" by staying quiet.

---

## 7. Things DynaMo Still Gets Wrong, Said Honestly

Being straightforward about what doesn't work well yet, rather than only listing what does:

**1. A city's weather is treated as one single point, even for huge cities.** DynaMo checks one map coordinate per city. A city as large as Mumbai or Bangalore can genuinely have rain in one part and sunshine in another at the exact same moment, and DynaMo has no way to tell the difference — it just picks the one point and treats it as true for the whole city. At the current small scale (4 cities), this is an accepted simplification, stated openly rather than quietly assumed away. At real scale (200+ cities, including much bigger ones), the honest fix is multiple sample points per large city, averaged or handled cautiously depending on how much risk the brand is willing to accept — and that's a real decision to make on purpose, not something to default into by accident.

**2. DynaMo can't reach into an ad that's already being shown.** DynaMo only ever decides "which ad is *eligible* right now" — it hands that answer to a separate ad-serving system, which is the thing that actually shows ads and runs the auction. If an ad flips from "rain ad" to "heat ad" the instant after someone starts watching the rain ad, DynaMo has no way to interrupt that — it can only make sure the timestamp on its answer is honest, so whatever's consuming it can judge for itself how stale the answer might be. This connects directly to a real open question, explained in Section 8, that's worth asking out loud rather than assuming an answer to: **does the ad-serving system actually check in every so often, or does it read DynaMo's answer instantly, live?** DynaMo doesn't get to see that system's internals, so it can't know for certain — it only makes its own honesty (the timestamp) as solid as possible, whichever the truth turns out to be.

---

## 8. The Big Decisions — Explained Simply

**Why Supabase instead of Airtable?**
Airtable is easy to set up, almost like a spreadsheet. But anyone with access could quietly edit an old diary entry in Airtable — and the whole point of the `transitions` table is that it can *never* be secretly changed. Supabase (a real database) lets us technically lock that table so even an admin literally cannot edit or delete old rows by accident. Trust needed a real lock, not just a polite request not to touch it.

**Why WeatherAPI.com instead of a free alternative?**
There's a free weather service (Open-Meteo) that's even easier to use, but its rules say you can't use it for anything commercial, like ads. WeatherAPI.com's rules clearly allow commercial use on its free plan, and it happens to also hand back both "right now" weather and an hourly forecast in a single request, which is convenient. So it's the only option that's both legally safe and practically useful.

**Why does missing data mean "play it safe" instead of "keep the last known ad"?**
Imagine you're not sure if it's raining, so instead of guessing, you just wear your everyday shoes instead of picking rain boots or sandals. DynaMo does the same thing: if it isn't confident in the data, it shows the safe "anytime" ad rather than betting on a rule that might now be wrong. The tradeoff: even one bad or slow weather check for a few minutes can bump a city into "safe mode" for a bit — but a wrong drink ad in the wrong weather is a worse outcome than a boring-but-safe ad for a few minutes.

**Why check freshness every 15 minutes?**
Weather doesn't change instantly, so DynaMo doesn't need to check every second — that would be wasteful and would cost more money in weather-service calls. But it also can't wait too long, or it'll be showing an ad based on weather from hours ago. 15 minutes was picked as a comfortable middle ground: fresh enough to feel "live," relaxed enough to be cheap.

**Why share one weather reading across all clients targeting the same city?**
Weather in Mumbai is one true fact — it doesn't change depending on which company is asking about it. So instead of every client separately paying to ask "what's the weather in Mumbai?", DynaMo asks once, saves the answer, and every client targeting Mumbai reads that same saved answer. This is what keeps costs low even as more clients and cities are added — a handful of weather checks now covers everyone, not one check per client. The one thing given up for this saving: cities are no longer fully private to one client at the data layer. That's a safe trade for something public like weather, which is the same fact for everyone anyway — but it wouldn't be safe for a future signal that's actually private to one client, which is why this stays a deliberate, named exception rather than the rule for everything.

**Why assume the ad-serving system is "a little bit behind" instead of instantly live?**
This is the same idea as texting someone a photo instead of them watching over your shoulder live. If we assume the ad system checks in every so often (rather than watching every instant), the cost of being wrong is tiny — we just wrote a timestamp nobody strictly needed. But if we assumed the opposite — that it's instantly live — and we were wrong, the ad system could keep showing an old, wrong ad for a while with nobody realizing it, because we never bothered to say how old our answer was. So DynaMo always stamps every answer with "this was true as of this exact time," which works safely either way. As Section 7 says, this is genuinely a guess, not a known fact — worth asking out loud, not quietly assumed.

**Why wait 20 minutes before flipping an ad back and forth (the "dwell" rule)?**
Imagine rain sensors flicker between "just barely raining" and "just barely not raining" for ten minutes straight. Without a rule against it, the ad would flip back and forth every couple of minutes, which looks broken and confusing. So DynaMo holds its current ad steady for at least 20 minutes before allowing a "same-importance" flip-flop — but it never holds back a *genuinely urgent* change, like actual heavy rain starting, or a move back to the safe default ad. Those always happen immediately. Only the flickery, low-stakes kind of change gets delayed.

**Why let one city have its own special number (per-location threshold override)?**
A "hot day" isn't the same everywhere. 35°C is scorching in Delhi but barely notable in some coastal cities. Using one single number for every city means it'll be right for some cities and simply wrong for others — not because of a bug, but because nobody tuned it. Letting one city override the number, without needing a whole separate campaign just for that city, fixes this cheaply.

**Why "current rain right now," not "any rain in the last hour"?**
The more obvious-sounding rule would be: if it rained at all in the last hour, show the rain ad. But that actually backfires — one single drop of rain 55 minutes ago would keep the rain ad showing for a full hour after it's already dry and sunny again, which is exactly the kind of embarrassing mismatch this whole system exists to prevent. Checking the *current* rain reading instead avoids that trap, even though "last hour" sounds like the more natural first instinct.

**Why "feels-like" temperature instead of the plain thermometer reading?**
Two cities can both show "33°C" on a thermometer and feel completely different — a dry 33°C is comfortable, a humid 33°C (like Chennai often has) can feel much hotter and stickier. Most weather services also calculate a "feels-like" number that already factors in humidity, so using that instead of the raw thermometer reading means the heat ad fires when it actually *feels* hot, not just when a number technically crosses a line.

**Why store money fields (bid, budget) but not use them yet?**
The brief asked us to track them so the system's shape is ready for later, but explicitly said not to build the logic that spends money based on them yet. So the fields exist and are saved, but no decision in this version reads them. Building that logic properly (auction bidding, daily spend limits) is a bigger, separate piece of work saved for later — see Section 10.

---

## 9. What We Chose Not to Build, On Purpose

Building everything imaginable isn't a strength — it's a distraction from proving the core idea works. These were left out deliberately, not forgotten:

- **A drag-and-drop rule editor.** Right now, adding a new rule (like a new signal type or a new threshold) is done by someone with direct access to the setup screens or database, not by a completely non-technical person clicking through a no-code builder. The underlying design (Section 4's `bindings` table) is already shaped so that a proper no-code editor could be built on top of it later without changing anything underneath — but building that friendly editor itself was skipped for now.
- **Actually spending money.** The `bid` and `daily_budget` fields are saved (Section 4), but nothing in this version uses them to actually run an auction or pace spending across a day. That's genuinely a separate, bigger system.
- **A "budget guard" that slows things down automatically as costs rise.** Explained in Section 11 — the database already keeps the information such a guard would need, but the actual automatic slow-down logic wasn't built, since it was explicitly called a nice-to-have, not something that needed to be proven.
- **Full, fine-grained permissions.** Right now it's just "internal or client" and "can change things or can only look." A bigger system (separate permissions for a brand lead vs. a day-to-day operator vs. platform staff) is a reasonable next step, not something this version needed.
- **Actually running the ad auction, or reacting mid-impression.** DynaMo decides which ad is *eligible*. It doesn't run the auction, doesn't serve the actual ad, and doesn't try to interrupt an ad that's already mid-play. That's a different system's job entirely, and deliberately out of scope here (see Section 7 for the honest limitation this creates).
- **Reacting to more than one kind of signal at once.** The design supports adding other trigger types (Section 12), but this version only actually wires up weather. Cricket, football, air quality, and so on are shown as worked examples, not shipped features.

---

## 10. Risks Worth Watching

A few things worth keeping an eye on once this is running for real, not because they're broken today, but because they're the kind of thing that quietly goes wrong if nobody's watching:

- **Being "too safe" for too long.** If the weather check keeps failing or feels flaky, a city could sit in safe/fallback mode for hours — technically never wrong, but also never doing its actual job of matching the ad to the moment. Worth tracking how often cities are in fallback mode as its own number, not just whether the system is "up."
- **A forgotten override.** Someone forces an ad for a good reason today, then forgets about it next week, while the weather (and the reason) has long since changed. This is exactly why the override banner (Section 6) is loud and impossible to miss on every screen, not just visible if you go looking for it.
- **Numbers that were never actually tuned right.** A threshold that's technically "correct" but was copy-pasted from a different city can quietly underperform for months without ever throwing an error — it just quietly never fires. This is part of why per-city threshold overrides (Section 4) exist.
- **Two rules disagreeing at once, at bigger scale.** With just weather, rain and heat rarely have a real conflict (priority handles it cleanly). But once more trigger types are added — say, a cricket win *and* rain happening at the same moment — someone needs to have actually decided, on purpose, which one should win, rather than leaving it to chance. The priority number on every rule (Section 4) is exactly the mechanism for deciding this, but it only works if someone actually sets sensible priorities as new triggers are added.

---

## 11. Does This Actually Work at Real Scale? (10,000+ Ads, 200+ Cities)

Everything above was explained using the small version: 12 ads across 4 cities. But the real DynaMo has to work for something much bigger — over 10,000 ads, spread across 200+ cities. Here's the math, walked through honestly rather than waved away.

**Checking the weather isn't free.** Every time DynaMo asks an outside weather service "what's happening right now in this city?", that costs a tiny bit of money — about $0.001, a tenth of a cent, per check. And there's a hard daily spending ceiling: $50 a day, no matter what.

**Weather doesn't need second-by-second updates.** CoolSip is fine with weather information being up to about 15 minutes old. It changes, but not that fast.

So here's the real question: with 10,000 ads across 200 cities, does DynaMo need to make 10,000 separate weather checks to figure out what to show? **No — and this is the single biggest cost-saving idea in the whole design.**

Look back at the `signal_readings` table in Section 4. A weather reading is saved **per city**, never per ad and never per client. Delhi's weather is one single fact, whether 1 ad or 500 ads are pointed at Delhi. So DynaMo only ever needs to check each city's weather once, no matter how many ads or clients are targeting it.

That means 200 cities need 200 weather checks per round — not 10,000. If DynaMo checks each city every 10 minutes (comfortably inside the 15-minute "still counts as fresh" rule), that comes out to:

- 200 cities × 6 checks an hour × 24 hours = **28,800 checks a day**
- At $0.001 each, that's **about $28.80 a day**
- The daily limit is $50 a day

So even at the full 200-city size, this comfortably stays under budget, with roughly $21 a day of room left over — using the brief's own plain, provider-agnostic price. (The actual weather service DynaMo uses turns out to be even cheaper than this at that scale, but the $28.80 number is the one worth trusting, since it doesn't depend on any one company's pricing page staying the same.)

**What if costs ever crept close to the $50 ceiling anyway?** The right move is to slow down gently, not to suddenly break. For example: check the weather a little less often, or stretch the "still counts as fresh" window slightly, before ever refusing to make a decision at all. This kind of safety valve (often called a "budget guard") wasn't built in this version — it's called out in Section 9 as a deliberate skip — but the database already keeps exactly the information a budget guard would need to make that call later: every reading already records which service answered and whether the check succeeded or failed.

**Why doesn't thinking about 10,000 ads cost 10,000 times more work?** Because DynaMo makes its decision **once per city**, not once per ad. Every ad in a city shares that city's same weather reading and the same rules, so DynaMo decides "which one ad wins here" a single time, then updates every ad in that city to match. The amount of thinking DynaMo has to do grows with the number of *cities*, not the number of *ads* — 200 cities means 200 decisions, whether 12 ads or 10,000 ads are spread across them.

---

## 12. Making DynaMo Work For Any Kind of Event (Not Just Weather)

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
- Result: the moment a boundary is hit, this rule becomes true, and — following the exact same steps as Section 5 — the ad switches, gets logged, and respects the same 20-minute anti-flicker and human-override rules automatically. Nothing about *how* the decision gets made changes at all.

### Example 2: Football (soccer) — reacting to a win or a loss

- New `signal_types` row: `{ name: "football.match_result" }`
- A fetcher saves: `{ result: "win" }`, `{ result: "loss" }`, or `{ result: "draw" }` after a match ends
- Two new `bindings` rows: "IF `result` equals `win`, show the 'Victory Cooler' ad, priority 70" and "IF `result` equals `loss`, show a comforting 'Better luck, refresh anyway' ad, priority 65"
- Because both new rules have real priority numbers, and rain/heat rules keep their own numbers too, DynaMo automatically knows which one should win if, say, it's both raining *and* the home team just won — no extra work needed, because the "biggest priority number wins" logic already exists and doesn't care which kind of fact the rule came from. (This is also exactly the kind of two-rules-disagreeing situation flagged in Section 10 as worth watching once more trigger types are actually in play.)

### Example 3 (bonus): Air quality or a stock market crash

- Same recipe again: one `signal_types` row (e.g. `"env.aqi"` or `"market.index"`), one small fetcher, one or more `bindings` rows with a chosen priority.
- A mask or purifier brand could show a "protect yourself" ad when air quality crosses a bad number. A finance app could show a "steady advice" ad the moment a market index drops sharply. Same three ingredients, every time.

### What never has to change

No matter which of these gets added: the actual decision-making program, the freshness/safety check, the flip-flop protection, the permanent diary table, the human-override system, and every dashboard screen (the city grid, the live meter, the history page) all keep working exactly as they already do. They were built to read "some fact, some field, some number" generically — never "weather" specifically. Adding a new kind of trigger is closer to filling out a form than writing new code.

The one piece of real, honest work each time is step 2 — writing that one small fetcher program for the new outside data source. Everything downstream of it is already built to handle whatever that fetcher hands over.

---

## 13. How We'd Know DynaMo Is Actually Working

Building it is one thing — here's how anyone would actually check, over time, whether it's doing its job:

- **Did a wrong ad ever actually go out?** The target is zero, always. This is the single most important number, because it's the one thing the whole system exists to prevent.
- **How often is data fresh enough to trust?** Aiming for the vast majority of decisions (95% or more) being made on data inside the 15-minute freshness window, not on stale guesses.
- **How much time do cities spend in "safe mode"?** A little is fine and expected. A lot, for a long time, means the system is technically safe but not actually adding much value — worth watching, not ignoring (see Section 10).
- **How often do humans feel the need to step in and override?** If this number falls over time, that's a good sign — it means people trust the automatic decisions more and more. If it stays high, that's worth asking why.
- **Was a second kind of trigger ever added without changing the core engine?** This is the real test of everything claimed in Section 12 — not a promise, but something that either turns out to be true or doesn't, the first time someone actually tries it.

---

## 14. Quick Recap — Every Decision, In One Line Each

- **Database:** Supabase, because it can truly lock the audit trail — Airtable can't.
- **Weather source:** WeatherAPI.com, because it's the only option that's both free and legally fine for ads.
- **Missing/old data:** always fall back to the safe default ad — never guess.
- **Freshness window:** 15 minutes — fast enough to feel live, slow enough to stay cheap.
- **Loop timing:** an automatic check every 10 minutes, plus a manual "run it now" button that does the exact same thing on demand.
- **Weather cache:** shared across every client targeting the same city — one fact, checked once.
- **Ad-server timing:** assumed to check in periodically, not instantly live — the safer guess either way, always paired with a timestamp, and openly flagged as a real open question, not a settled fact.
- **Anti-flicker (dwell):** hold steady for 20 minutes on low-stakes flips; genuinely urgent changes and the safe default always apply immediately.
- **Per-city thresholds:** one campaign-wide number by default, with the option to give one city its own number.
- **Rain rule wording:** "raining right now," not "rained any time in the last hour" — the more obvious-sounding rule actually backfires.
- **Heat rule wording:** "feels-like" temperature, not the plain thermometer number — humidity changes how hot something actually feels.
- **Money fields (bid/budget):** stored for the future, not used in decisions yet.
- **Human override:** always wins over every automatic rule, no exceptions.
- **Access:** invited-only accounts, two simple permission levels — not a full role system yet, on purpose.
- **Condition injection:** a way to fake a reading on demand, purely so the system's behavior can be shown and tested without waiting for real weather.
- **History depth:** the last 20–50 changes per city — enough to explain a busy day without becoming unreadable.
- **What we skipped on purpose:** a no-code rule editor, actually spending the stored bid/budget money, an automatic budget-slowdown guard, fine-grained permissions, running the ad auction itself, and reacting to more than one kind of live signal at once.
- **Known honest limitations:** one weather point stands in for a whole city, and DynaMo can't reach into an ad that's already mid-play on the ad-serving side.
- **Extensibility:** any new kind of live event needs only one new signal type, one small fetcher, and new rule rows — the decision-making logic, safety checks, diary, and screens never need to change.
- **Scale (10,000+ ads, 200+ cities):** checking weather per-city instead of per-ad keeps this at 200 checks a round, not 10,000 — about $28.80/day at $0.001/check, under the $50/day cap, with room to spare.
