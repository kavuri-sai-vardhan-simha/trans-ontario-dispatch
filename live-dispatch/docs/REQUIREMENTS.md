# Requirements — Trans Ontario Live Dispatch (APP_2)

> **Planning record (Oct 17).** Since then, after talking with Trans Ontario: no customer app (orders stay in Elite; an Elite order desk simulator stands in), drivers can only ask to decline with a reason and the dispatcher decides, regular customers come first, cost is an optional toggle, truck sizes come from trans-ontario.com (15,000 lb straight truck). Current build: `README.md`, `docs/ARCHITECTURE.md`, `docs/DIAGRAMS.md`.

Status: **v2 (final design)** · 2-day prototype · 2026-10-17
Sources allowed: challenge brief, Trans Ontario data, trans-ontario.com, what their representative told us (see KNOWN_FACTS.md).

## 1. Goal
Replace the phone calls dispatchers make to find a truck for a new pickup. Their systems stay: **Elite** (orders), **Samsara** (GPS, driver app, stop order, stop done-marks), **Scarborough depot** (overnight hand-off). We add **one decision layer** that knows, live, where each truck is and how much room it has. For every new pickup it recommends the best trucks with reasons. The dispatcher assigns in one click.

## 2. The one rule
A truck can take a pickup only if all three are YES:
1. **Room** on board at that moment (weight and floor spots).
2. **Reach it in time** (after ready time, before the shipper closes) and deliver or drop at the depot on time.
3. **Everyone else still on time** (no other stop pushed past its promise).

Plus the hard rules: right equipment (53 ft / straight / van, tailgate), right licence (AZ/DZ/G), driving hours (13 h driving / 14 h on duty).

**Fleet rule:** we only use Trans Ontario's own vehicles and drivers as they appear in their data. No vehicles are added. When several of their vehicles can take a stop, the smallest suitable one is preferred (a van for a small city parcel, keeping bigger trucks free). "Spare truck" options only use their own units that were idle that day.

## 3. Users
| User | What they use | Need |
|---|---|---|
| Dispatcher (main user) | Our console beside Elite | The right truck in seconds, early warnings |
| Driver | Samsara app (demo: our driver page) | New stop on the route; one-tap "space left" when asked |
| Customer | Phone, email, Web Dispatch, tracking portal (theirs) | Unchanged; faster pickup |

## 4. Must have (P0)

### A. Live truck position
- **R1** Two sources: **Samsara GPS (main)** and the **driver's phone (backup**, during shift, with consent). The **newest position wins**; show its age and source ("2 min ago · Samsara").
- **R2** Between pings, estimate the position along the route. No ping from either source for **10 min** → truck flagged **stale**: the only one the dispatcher needs to call.
- **R3** If the two sources disagree by more than ~1 km → flag "check this truck".

### B. Space on board
- **R4** **Calculated automatically**: morning load from Elite order sizes (weight, pieces, skid spots), minus each delivery and plus each pickup as Samsara marks the stop done.
- **R5** **Missing skid spots are estimated** (pieces for skids/pallets; weight ÷ 1,500 for loose freight) and shown as "estimated".
- **R6** **Driver one-tap confirm**: after a pickup, or when the estimate is uncertain (any skid count estimated on board), the driver app asks *"Free floor spots left?"* (slider 0 – truck size). The driver's answer **overrides** the calculation until the next stop.
- **R7** If the driver's answer differs from the calculation by **more than 2 spots**, raise a data-quality flag on the orders involved.
- **R8** Never ask more than once per stop; skip asking when the estimate is confident.

### C. New pickup → recommendation
- **R9** A new order arrives from Elite (any channel: phone, email, Web Dispatch). For the demo: an "incoming orders" feed replayed at their real times.
- **R10** Check every truck with the one rule (§2), from its **live** position and **live** space.
- **R11** Show the **top 3** with: pickup ETA, extra km/min, space at pickup (and whether estimated), effect on its other stops, and why the others were ruled out.
- **R12** Fallbacks when no truck fits today: **pickup today → depot overnight → delivered next day by another truck**; partner carrier (freight > 90 km); tomorrow's regular route.
- **R13** Dispatcher clicks **Assign** → the stop is added to that truck (in real life: assignment in Elite → Samsara route, as today).

### D. Early warnings
- **R14** Truck running late vs a promise (from live position) · stale truck · space mismatch · order with missing size data · a truck near its hours limit.

### E. Changes during the day (from App 1)
- **R15** Breakdown, driver absent, late freight, failed delivery, cancellation: compare options, apply one. Uses live positions and space.

### F. Proof
- **R16** **Replay Sep 29**: trucks move by their real GPS arrival times; pickups appear at their real dispatch times; the panel recommends a truck. Compare with what really happened: pickup delay, extra km, late stops.
- **R17** Case study (111 Gibraltar Rd) reproducible in the replay.

## 5. Should have (P1)
- **R18** Driver demo page (phone-sized): next stops, new stop notice, "space left" tap, phone GPS sharing.
- **R19** **AI 2 · Email → order draft** for the CSR (free LLM): reads pickup/delivery address, weight, pieces, ready time from a booking email; a person checks it before it goes into Elite.
- **R19b** **AI 1 · Free space from a photo**: when the driver is unsure, they photo the open trailer; an object-detection model counts pallets and empty floor and suggests "free spots"; the driver confirms or corrects (feeds R6).
- **R20** On-site time prediction per customer from ~2,500 real dwell times (simple model, tested on held-out days).
- **R21** Road distances via OSRM instead of straight-line × factor.

## 6. Not in the prototype
Real Elite/Samsara connection (needs their access) · customer booking app (they have Web Dispatch) · Flutter app · payments, accounts. (AI 1 and AI 2 are P1: shown in the deck as next steps, built only if time allows.)

## 7. Values used (shown in the app)
| Item | Value |
|---|---|
| Van | 2,000 lb · 2 spots · G/DZ/AZ (assumed; not on the website) |
| Straight truck | 15,000 lb · 12 skids · DZ/AZ · tailgate OK · 30 min free wait (**website**; single-axle, the safer of 15,000/28,000) |
| 53' trailer | 44,000 lb · 26 skids · AZ · no tailgate/residential · 1 h free wait (**website**; tandem, the safer of 44,000/64,000) |
| Floor fill limit | 95% for multi-stop loads |
| Service time | 12 min + 3 min per skid, capped at the free wait time (30 min straight, 60 min 53') |
| Service cutoffs | Rush 15:30 · Out of town 13:30 · Same day / Overnight 17:00 pickup; Same day order by 12:00, Overnight by 15:30; after 16:00 call in (**website**) |
| Same-day orders | Rush / Same day: the same truck picks up and delivers by 17:00 (or the delivery appointment) |
| Travel time | straight-line × 1.2–1.45, 18–55 km/h by leg length (calibrated on their GPS legs) |
| Licences | inferred from vehicles driven |

## 8. Recommendations to Trans Ontario (free process fixes)
1. Make **skid spots** a required field at order entry (recorded on only 35% of stops today).
2. Record each unit's **axle type** (single/tandem) in Elite, so the true capacity (15,000 vs 28,000 lb) is used.
3. Show **live Samsara GPS** on the dispatch screen instead of last-stop status.
