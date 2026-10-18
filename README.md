# Trans Ontario · Smarter Freight, Smarter Routes

**Team entry for the Catalyst hackathon case study by Trans Ontario Express.**

Trucks drive around with empty space while customers wait for pickups, because the dispatcher can't see, live, which truck is close and has room. Today they phone drivers to find out. Our system checks every truck in about 3 milliseconds and shows the dispatcher the best ones, with the reasons. One click assigns it, and every screen updates.

It sits **between the systems Trans Ontario already uses**: orders stay in **Elite**, drivers keep the **Samsara** driver app. No new app for customers or drivers.

---

## What's in this repo

| Folder | What it is | How to open it |
|---|---|---|
| [`live-dispatch/`](live-dispatch/) | **The live prototype.** One server with five screens: Elite order desk (simulator), Dispatcher, Driver (inside Samsara Driver), Plan the day, and an audience booking page (stands in for Trans Ontario's Web Dispatch portal). Replays a real day from Trans Ontario's data. | Python 3.10+ → `run_prototype.bat` (Windows) or `./run_prototype.sh` (Mac/Linux). See [`live-dispatch/HOW_TO_RUN.md`](live-dispatch/HOW_TO_RUN.md). |
| [`plan-the-day/`](plan-the-day/) | **Plan the day, standalone.** The whole-day planner in one HTML file: plans all 10 real days, compares the model's plan with the actual dispatch, disruptions, issues. Also embedded in the prototype at `/plan`. | Open `plan-the-day/index.html` in Chrome. No install. |

## Results (10 real days, Sep 21 – Oct 2, 2026, Trans Ontario vehicles only)

| | Our system | Real dispatch |
|---|---|---|
| Time to check every truck for one order | **3 ms** | phone calls |
| 500 orders in one day | **1.5 s** in total | — |
| **Whole-day plan:** trucks sent out | **277** (−35%) | 428 |
| Whole-day plan: late stops | **159** (−59%) | 387 |
| Whole-day plan: km | 82,761 (same) | 83,674 |
| **New orders, live, one at a time:** picked up earlier / later (> 15 min) | **599 / 202** of 945 | — |
| New orders: average customer wait after freight is ready | **37 min** | 1 h 35 |
| New orders: extra km for those pickups | 15,657 (+4%) | 14,987 |

- **The whole-day plan is a best case:** it sees all the day's orders at once.
- **The live test** replays orders one at a time, using only what was known at that moment, and decides as soon as the freight is ready. Deciding at the exact moment the real dispatcher did gives **466 earlier / 202 later**, with the wait dropping to 1 h 13.
- **Both sides use the same travel model**, calibrated on Trans Ontario's GPS trips, and the same rules.

## How a truck is chosen

A truck gets the pickup only if all three answers are **yes**:

1. **Is there room?** Weight and skid spots at the fullest point between the pickup and where that freight comes off the truck.
2. **Can it get there in time?** Before the service cutoff (Rush 3:30 pm, Out of town 1:30 pm, others 5 pm), within shipper hours and appointments.
3. **Is everyone else still on time?** No other stop may become late.

It also checks:
- driver hours: 14 h on duty and 70 h in 7 days
- truck type, tailgate for no-dock sites, height
- dangerous goods (TDG) are never stacked

Trucks that pass are ranked by customer wait (regular customers count 1.5×), extra driver minutes and extra km. The dispatcher always decides.

**After assigning:**
- The driver taps **OK, got it** or raises a concern, and the dispatcher decides.
- No OK in 5 minutes sends an automatic reminder; at 10 minutes the dispatcher is told to call.

**Disruptions handled:** breakdown, driver off sick (spare driver or share the work), traffic delay, freight not ready, failed delivery, cancellation.

## Data

- Trans Ontario's anonymised routing report (Samsara stops and GPS + Elite order details), Sep 20 – Oct 3, 2026: 10 operating days, 1,635 pickups, 2,530 stops.
- Truck sizes and service cutoffs: trans-ontario.com. Straight truck 12 skids / 15,000 lb; 53 ft trailer 26 skids / 44,000 lb.
- The sponsor's raw Excel files are **not** in this repo. The processed day files the app needs are in `live-dispatch/data/processed/`.

## Honest limits

- It replays real days; it isn't connected to live Elite or Samsara yet. The sync log shows exactly what would be sent.
- Travel times come from a model calibrated on their GPS, with no live traffic yet. Model km read higher than GPS km, but both sides use the same model.
- Some inputs are assumed: truck heights. Drivers' TDG certificates aren't in the data, so the system flags them.
- Skid spots are recorded on only 35% of stops; the rest are estimated from weight and pieces.

## Built with

Python · FastAPI · SQLite · WebSocket · React + Vite · Leaflet / OpenStreetMap · plain JavaScript planner (regret insertion + local search). The AI part: stop times learned from 1,478 real stops (optional switch in the dispatcher).
