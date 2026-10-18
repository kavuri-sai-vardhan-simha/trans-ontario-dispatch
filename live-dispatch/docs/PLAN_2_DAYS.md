# 2-day build plan (v2, matches REQUIREMENTS v2)

> **Planning record (Oct 17).** Since then, after talking with Trans Ontario: no customer app (orders stay in Elite; an Elite order desk simulator stands in), drivers can only ask to decline with a reason and the dispatcher decides, regular customers come first, cost is an optional toggle, truck sizes come from trans-ontario.com (15,000 lb straight truck). Current build: `README.md`, `docs/ARCHITECTURE.md`, `docs/DIAGRAMS.md`.

Goal of the demo: replay **Sep 29** live. Trucks move as they really did; new pickups appear at their real times; our panel recommends the best truck; we compare with what actually happened.

## Day 1: the brain (Python, FastAPI)
| # | Build | Done when |
|---|---|---|
| 1 | **Seed data** from the sponsor report: trucks, drivers, orders, real GPS stop times for Sep 29 | JSON files load; numbers match the report |
| 2 | **Truck state**: live position (replayed Samsara, phone backup), freshness, load on board, remaining stops, hours used | Ask "where is Truck #218 at 11:21 and how full?" → correct answer |
| 3 | **Space**: calculated from Elite sizes + stop done-marks; estimated flags; driver tap override | Unit tests: tap overrides, >2-spot gap flags |
| 4 | **The check**: 3 questions + equipment, licence, hours; score = extra km + extra minutes + customer wait; top 3 with reasons and ruled-out list | Gibraltar Rd case returns Truck #218 first |
| 5 | **Replay engine**: clock, pickups appearing at real dispatch times, warnings (late, stale, mismatch, hours) | Sep 29 runs start to end |
| 6 | **API + live updates** (WebSocket) | Browser receives positions and recommendations |

## Day 2: the screens + proof
| # | Build | Done when |
|---|---|---|
| 1 | **Dispatcher console**: live map, incoming orders, top-3 panel with reasons, one-click Assign, warnings feed, clock controls | Judge can click through a pickup |
| 2 | **Driver demo page** (phone-sized): next stops, new stop notice, "free spots left?" tap | Tap changes the space shown in the console |
| 3 | **"Fill the gaps" suggestions**: truck with free space passing a later pickup → suggest collecting now | Appears at least once on Sep 29 |
| 4 | **Results panel**: our picks vs what happened (pickup delay, extra km, late stops) | Numbers shown with method notes |
| 5 | **Disruption**: truck breakdown on the live replay (reuse App 1 logic) | Options shown, apply one |
| 6 | Demo run-through + README run steps | Two commands start everything |

## If time is left (P1, in this order)
1. AI 2: email → order draft (free LLM).
2. AI 1: photo → free spots (object detection).
3. Road distances (OSRM).

## Not doing
Real Elite/Samsara connection · customer app · Flutter · payments.
