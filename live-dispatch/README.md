# Live dispatch prototype

The live part of our entry. It replays a real day of Trans Ontario's data and adds a decision layer between **Elite** (orders) and **Samsara** (trucks and drivers). How to start it and demo it: **[HOW_TO_RUN.md](HOW_TO_RUN.md)**.

| Screen | Path | What it does |
|---|---|---|
| Dispatcher | `/dispatch` | Live map, **New** orders with a count, waiting orders (regular customers first), best trucks with reasons, tap a truck card to see it on the map, warnings, driver concerns, disruptions, *Manual vs our system* and the success scorecard. |
| Elite order desk (simulator) | `/elite` | Stand-in for Elite: the day's real orders appear at the time they were entered, and staff can enter a phone or email order. Shows each order's truck. |
| Driver (inside Samsara Driver) | `/driver` | New pickup already on the route: **OK, got it** or raise a concern. Free floor spots, report a problem, phone GPS. |
| Plan the day | `/plan` | Whole-day plan of every truck. Model's plan vs actual dispatch. Live orders land on their truck automatically, with every rule ticked. Truck search. |
| Audience booking | `/book` | Stands in for the Web Dispatch portal: pin a pickup, book, track it. Limited to 3 orders per phone. |

## Folders
| Path | What is there |
|---|---|
| `backend/app/main.py` | FastAPI: REST API, WebSocket `/ws`, serves the screens |
| `backend/app/engine/replay.py` | The engine: three checks, ranking, disruptions, comparison with what really happened |
| `backend/app/sim/world.py` | The live day: replay clock, orders, assignments, driver replies, reminders, cancellations |
| `backend/app/core/` | `config.py` (truck sizes, cutoffs, rules, default day) · `integrations.py` (Elite and Samsara stubs) · `share.py` (audience link) |
| `backend/app/db/store.py` | SQLite store for entered orders, decisions and events |
| `data/processed/days/` | The 10 real days, built from the routing report by `scripts/build_replay.py` |
| `data/processed/` | `dest.json` (final destination of each pickup), `dwell.json` (learned stop times), `places.json` (real addresses for the booking page), `stress.json` (500-order speed test) |
| `scripts/` | Data builders, stop-time model (`train_dwell.py`), speed test (`stress_test.py`) |
| `web/` | React + Vite source (`src/apps/{dispatch,elite,driver,book}`), built files in `web/dist/` |
| `docs/` | Design notes and the planning record. The numbers in the top-level README are the current ones. |

## Key rules
- A truck gets a pickup only if all three answers are yes: **room** (at the fullest point until that freight comes off), **in time** (service cutoff, shipper hours, appointments) and **everyone else still on time**.
- Also checked: 14 h on duty, 70 h in 7 days, truck type, tailgate, height, TDG never stacked.
- Ranking: customer wait (regular customers count 1.5×) + extra driver minutes + extra km. Optional illustrative $ view.
- Regular customer = 3+ orders on the earlier days of the report.
- Drivers can't remove a job themselves: they raise a concern, and the dispatcher decides.
