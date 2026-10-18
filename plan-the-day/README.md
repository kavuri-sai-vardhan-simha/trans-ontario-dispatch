# Plan the day (standalone)

The whole-day planner in one HTML file. **Open `index.html` in Chrome.** No server, no install. It runs on Trans Ontario's real routing report: 10 operating days, Sep 21 – Oct 2, 2026.

The same planner is embedded in the live prototype at `/plan`, where orders assigned by the dispatcher appear on their truck automatically.

## What it does
- **Plans the day:** assigns and orders every stop on a truck, respecting:
  - payload and floor space (skid spots)
  - equipment: 53 ft / straight truck / van
  - tailgate and residential limits
  - driver licence (AZ/DZ/G)
  - appointments and service promises
  - driver hours: 13 h driving / 14 h on duty
  - pickup before delivery
- **Model's plan vs Actual dispatch:** flip the map between our routes and the routes really driven, with the numbers side by side.
- **Issues:** stops that can't be planned (with the reason), late stops, near-limit drivers, data-quality flags. Also an audit of the actual dispatch with the same rules.
- **Disruptions:** breakdown, sick driver, late freight or rush order, failed delivery, cancellation. Options are compared before anything changes.
- **Trust:** click any stop for *why this truck*, the next-best alternatives and the trucks ruled out.
- **Rules tab:** edit capacities, costs and the departure time, then re-plan. Partner carriers are off by default because the data has none.
- **Search:** find a truck by number, type, driver, customer or city.

## Results (10 days, Trans Ontario vehicles only, same travel model for both)
277 trucks sent out vs 428 (−35%) · 159 late stops vs 387 (−59%) · 82,761 km vs 83,674 (same) · peak fill 85% vs 70%.
This is a best case: the plan sees the whole day at once, while dispatchers received orders during the day.

## Method
1. **Feasibility first:** every stop × truck is checked against the hard rules.
2. **Regret insertion:** appointments first, then the stop that would lose most by waiting.
3. **Local search:** move stops and pickup–delivery pairs between trucks while every hard rule holds.
4. **Re-planning:** freeze what has happened by time T, place trucks where they are, re-insert affected work, compare options.

## Files
`index.html` (built, self-contained) · `src/engine.js` (planner) · `src/index.src.html` (interface) · `src/data.js` (the 10 days) · `src/build.py` (bundles them into `index.html`).
