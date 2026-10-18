# Honest review — does our idea satisfy the Trans Ontario challenge?

> **Planning record (Oct 17).** Since then, after talking with Trans Ontario: no customer app (orders stay in Elite; an Elite order desk simulator stands in), drivers can only ask to decline with a reason and the dispatcher decides, regular customers come first, cost is an optional toggle, truck sizes come from trans-ontario.com (15,000 lb straight truck). Current build: `README.md`, `docs/ARCHITECTURE.md`, `docs/DIAGRAMS.md`.

## 1. The complete idea (one paragraph)
Trans Ontario keeps Elite (orders), Samsara (GPS, driver app, stop order, stop done-marks) and the Scarborough depot (overnight hand-off). We add a **decision layer** on top. It reads live truck positions (Samsara, with the driver's phone as backup, newest wins) and each order's size (Elite). For every new pickup it checks every truck with 3 questions: room at that moment? reach it in time? everyone else still on time? It also checks equipment, licence and driving hours. The dispatcher sees the best 3 with reasons and clicks once in Elite. The same rules plan the morning, flag conflicts early, and re-plan when a truck breaks down, a driver is absent, freight is late or a delivery fails.

## 2. What already exists at Trans Ontario (not ours, don't claim it)
| Exists | Source |
|---|---|
| Orders with weight, pieces, ready/due times in Elite | Data |
| Electronic dispatch to drivers via Samsara | Data, website |
| **Stop sequencing per route** (Google Routes optimisation, 15-min service time, appointment windows, pickup before drop) | Data README |
| GPS arrival/departure marks on 99.8% of stops | Data |
| Depot overnight hand-off | Data, website |
| Booking by phone, email, Web Dispatch; tracking portal | Website |

**Brutal point:** route *ordering* is already automated by Samsara. Our value is not "shortest route". It is **which truck**, **is there room**, **will promises break**, and **what to do when things change**.

## 3. What we have built (App 1 — working)
- Morning plan for 10 real days: assignment + sequence + capacity + equipment + licence + hours + appointments.
- Issues list + audit of the real dispatch.
- Disruptions: breakdown, sick driver, late freight, failed delivery, cancellation, with compared options.
- Booking options for a new pickup (incl. relay, now depot-only in the plan).
- Explanations: why this truck, alternatives, ruled-out reasons.
- Story deck (12 slides) with a verified real case study.

## 4. What we planned but have NOT built (APP_2)
- Live layer: positions + load on board in real time, top-3 recommendation panel, staleness flags.
- Replay of Sep 29 with pickups appearing at their real dispatch times.
- Python engine, API, dispatcher console, driver demo page.
- AI pieces (email → order draft; travel/on-site time model).

## 5. Scorecard against the brief (honest)
| Brief asks | Status | Honest note |
|---|---|---|
| Plan the day | ✅ App 1 | Hindsight plan; real orders arrive during the day |
| Identify problems | ✅ App 1 | Strong; audit of real data is our best evidence |
| Adapt when things change | ✅ App 1 (simulated) | Not yet live |
| Vehicle capacity / legal weight | 🟡 | Capacities **assumed** per class; no axle/GVW limits |
| Driver licences / hours | 🟡 | Licences **inferred**; no breaks or weekly cycle |
| Loading sequence | 🟡 | Last-stop-first floor plan only |
| Dimensions / stacking | ❌ | Cube not in data; stacking not modelled |
| Partner carriers | 🟡 | Simple quote model, invented rates |
| Data transparency / explain | ✅ | Strong |
| "AI" | 🟡 weak | It is optimisation (rules + search). No trained model yet |

## 6. Biggest weaknesses (what a judge could hit)
1. **Room on a truck is only as good as Elite's data.** Skid spots are recorded on only **35%** of stops; weight on 92%. Our "space" is partly estimated. *Fix:* show confidence, and recommend making skid spots required at order entry (a free process fix).
2. **Truck capacities are not in the data.** Every "% full" depends on our assumption. *Fix:* make them editable (done in App 1) and say so.
3. **Results are best case.** 70% fewer late / 36% fewer trucks / 23% fewer km come from planning the whole day with hindsight. *Fix:* the Sep 29 **replay** with real arrival times is the fair test. Until then, lead with the case study and the audit.
4. **The case study is one example**, and the dispatcher's choice was defensible (truck returning anyway). The 38% screening is rough (straight-line, estimated room, no promise check).
5. **Not live yet.** Elite/Samsara integration is a design, not tested.
6. **"AI" is thin.** I earlier claimed the data had planned-vs-actual ETA errors to train on. **That was wrong**: those columns are empty for our dates. A model can still learn from ~2,500 real travel and on-site times.
7. **People factors ignored:** driver preferences, customer relationships, union or shift rules, which dispatchers handle by experience.
8. **Distances are straight-line × factor**, not road distances; no live traffic.

## 7. What would make it clearly better (in priority order, fits 2 days)
1. **Replay Sep 29 live**: pickups appear at real times, the panel recommends a truck, compare with what happened (pickup delay, km, lateness). This is the fair proof.
2. **Show data confidence** on every recommendation ("room estimated: skid spots missing on 2 of 5 orders").
3. **Recommend 3 cheap process fixes** to Trans Ontario: require skid spots at entry; show Samsara live GPS (not Elite last-stop status) on the dispatch screen; record truck capacities in Elite.
4. **One small, real AI piece**: predict on-site time per customer from dwell history (big shippers vs residential), used in the ETA. Measurable on held-out days.
5. **No customer app** (decided after talking with Trans Ontario): orders stay in Elite; the prototype uses an Elite order desk simulator instead.

## 8. Verdict
Yes, it addresses the challenge's real problem (manual truck choice with stale information), fits their systems, and is backed by their own data. It is **not yet proven live**, and its capacity and "AI" claims are weaker than they look. Lead with: the real audit, the real case study, and a live replay. Be upfront about assumed capacities, estimated skid counts and best-case results.
