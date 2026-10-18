# Build steps (fastest path)

> **Planning record (Oct 17).** Since then, after talking with Trans Ontario: no customer app (orders stay in Elite; an Elite order desk simulator stands in), drivers can only ask to decline with a reason and the dispatcher decides, regular customers come first, cost is an optional toggle, truck sizes come from trans-ontario.com (15,000 lb straight truck). Current build: `README.md`, `docs/ARCHITECTURE.md`, `docs/DIAGRAMS.md`.

**Speed decision:** reuse App 1's planning engine (already written and tested on 10 real days) and build the live replay in the browser. No server is needed for the demo. A Python/FastAPI backend is only needed later, to connect to Elite and Samsara for real.

Each step ends with something you can show. Stop after any step and you still have a working demo.

| Step | Build | Reuses | Done when |
|---|---|---|---|
| 1 | **Sep 29 replay data**: every truck's real stop times, every pickup's real "given out" time, order sizes | App 1 data prep | One file loads with trucks, stops, times |
| 2 | **Live truck state** at any clock time: position, load on board, free space (est. flagged), freshness | App 1 engine | Truck #218 at 11:21 shows ~10,500 lb free |
| 3 | **Replay clock + map**: trucks move along real routes; play / pause / jump | App 1 map + clock | Map plays Sep 29 |
| 4 | **Incoming pickups feed**: each pickup pops up at its real time | Step 1 | Feed fills as the clock runs |
| 5 | **Top-3 panel**: 3 questions + rules, score, reasons, ruled-out list, one-click Assign | App 1 insertion check | Gibraltar Rd pickup shows Truck #218 first |
| 6 | **Compare with reality**: for each pickup, our pick vs actual truck: pickup time, extra km | Step 1 | Running totals on screen |
| 7 | **Warnings**: running late, stale position, near hours limit, missing size data | App 1 issues | Warnings appear during replay |
| 8 | **Driver page + space tap** (phone-sized, simulated) | — | Tap changes the truck's free space |
| 9 | **"Fill the gaps"** suggestions | Step 5 | Shows at least once on Sep 29 |
| 10 | **Breakdown on the live replay** | App 1 disruptions | Options appear, apply one |
| 11 | Practice demo + README | — | 3-minute run-through works |

**If time is left:** AI email → order draft · AI photo → free spots · real road distances.
**Later (production):** Python/FastAPI backend + real Elite and Samsara connection.
