# Architecture — APP_2 (as built)

```
 Elite order desk (sim) ─┐                          ┌─ Dispatcher (web)
 Driver screen (Samsara) ┼── REST /api (FastAPI) ───┤
                         └── WebSocket /ws (1 s) ───┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │ backend (Python, FastAPI)                           │
        │ sim/world.py     live day: clock, orders, decisions │
        │ engine/replay.py 3 checks, ranking, disruptions     │
        │ core/config.py   website sizes, cutoffs, ranking    │
        │ core/integrations.py  Elite + Samsara stubs         │
        │ db/store.py      SQLite (our layer only)            │
        └─────────────────────────────────────────────────────┘
                 ▲ data/processed/sep29.json (from the routing report)
```

**Elite stays the record.** Our store only keeps what our layer adds: orders typed at the desk simulator, dispatcher decisions, driver reports and events. Every decision is written back through the Elite / Samsara stubs and shown in the Sync log.

## Components
- **Replay clock** (`sim/world.py`): Sep 29, 06:00–21:00, speed 1–600×, saved to `clock.json`. Truck positions come from the real stop times (standing in for Samsara GPS).
- **Engine** (`engine/replay.py`):
  - **3 checks** per truck: room until the depot or the same-day drop; reachable before the service cutoff; others on time (appointment + 15 min or 17:00) and 14 h duty.
  - **Same-day pairs**: Rush / Same day pickups are inserted together with their delivery.
  - **Ranking** `time` (default): wait × customer weight (regular 1.5, occasional 1.2, new 1.0) + delay to other stops + km + penalty if worse. `cost`: illustrative $.
  - **Conflicts**: warns when a non-regular order would take the room a waiting regular customer nearby needs.
  - **Disruptions**: breakdown (on the road or before leaving), sick driver (spare driver / share the work / partner carrier).
  - **Compare** with what the dispatcher did, decided at the same moment or when the freight was ready.
- **Driver replies**: `OK, got it`, or a decline **request** with a reason (`no_room`, `too_late`, `equipment`, `hours`, `other`). The dispatcher approves (back to waiting) or overrides (kept, with a note to the driver).

## Data (SQLite tables)
| Table | Holds |
|---|---|
| `bookings` | Orders entered at the desk simulator (with the caller's phone/email to recognise returning customers) |
| `decisions` | Assign / unassign, breakdown, spare driver, decline approve / override |
| `reports` | Driver reports: free spots, problems, GPS gaps, decline requests |
| `events` | Timeline shown on the screens |

## API
| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/clock` · POST `/api/reset` | Replay clock, reset the day |
| GET | `/api/meta` · `/api/places` · `/api/services` | Day info, known addresses, open services |
| GET | `/api/elite/feed` · `/api/customers` · `/api/customers/lookup` | Orders as they entered Elite; customer tier by account or phone/email |
| POST | `/api/bookings` | Desk simulator: save an order "in Elite" |
| GET | `/api/trucks` · `/api/trucks/{u}` | Live trucks; one truck with stops, offer, problems |
| GET | `/api/orders` · `/api/orders/{pid}/options` | Orders; every truck checked, top options, ruled-out list, conflicts |
| POST | `/api/orders/{pid}/assign` · `/unassign` | Dispatcher decision |
| GET | `/api/warnings` · `/api/gaps` · `/api/events` | Problems, decline requests, GPS gaps, timeline |
| GET | `/api/compare` · `/api/compare/rows` | Manual vs our system |
| GET/POST | `/api/settings` | Ranking mode (time / cost) and wait weight |
| GET/POST | `/api/trucks/{u}/breakdown` · `/sick` | Options, then apply |
| POST | `/api/trucks/{u}/decline` | Dispatcher: approve or override a decline request |
| POST | `/api/driver/{u}/offer` · `/space` · `/problem` · `/gps-gap` · `/ping` | Driver screen |
| GET | `/api/decline-reasons` · `/api/track/{ordno}` | Reasons list; order status |
| WS | `/ws` | Snapshot every second |

## Tech
| Part | Choice |
|---|---|
| Backend | Python 3.10+, FastAPI, Uvicorn, SQLite |
| Web | React 18 + Vite (3 pages), Leaflet with OpenStreetMap tiles |
| Extras | Light / dark theme, English / French (Canadian) |
| Travel times | Straight-line model calibrated on their GPS (real roads and traffic: next) |
