# Core problem and plan (v2 — after talking to Trans Ontario)

> **Planning record (Oct 17).** Since then, after talking with Trans Ontario: no customer app (orders stay in Elite; an Elite order desk simulator stands in), drivers can only ask to decline with a reason and the dispatcher decides, regular customers come first, cost is an optional toggle, truck sizes come from trans-ontario.com (15,000 lb straight truck). Current build: `README.md`, `docs/ARCHITECTURE.md`, `docs/DIAGRAMS.md`.

## The real problem
Pickups come in all day. Today a dispatcher **phones drivers** to ask where they are and how much space they have, then decides by hand who can take the new pickup.

Their own data confirms it:
- **81%** of pickups are **booked the same day** they are collected (97% become ready that day).
- **82%** are given to a driver between **09:00 and 15:00**, while trucks are already out on the road.
- Each route is updated about **6 times a day on average** (median 3), and drivers average **1.8 routes a day**.

So the core job is **live pickup assignment**, not just a morning plan.

## Goal (one line)
Every new pickup gets the best truck in seconds, with no phone calls. It's picked up and delivered on time, trucks run fuller, and no rule is broken.

## Corrections to the first idea
1. **"No empty space" is not the goal.** The goal is to fill free space with pickups **as long as every promise is still kept**. Never overload a truck, and never hold a truck back to wait for more freight. We measure fill %, we don't force 100%.
2. **The main user is the dispatcher, not the customer.** Orders arrive by phone, email or the TMS. The dispatcher types or pastes the order, and the system answers "send Truck #218, ETA 14:10" with one tap to send. The customer app is a bonus channel.
3. **Space is the hard part, not location.** GPS gives location. Space on board is only known if the system tracks **what each truck carries**: the morning load, plus every pickup, minus every delivery, updated by the driver's taps. Without that, the dispatcher still has to call.

## What the system must know at every moment (per truck)
| Fact | Source |
|---|---|
| Where it is | Phone GPS every 5 s (Samsara later) |
| What's on board (lb, skids) | Morning manifest + driver taps "Picked up" / "Delivered" (+ quick "space left" correction) |
| What it still has to do, and its promise times | The live plan |
| Driver hours left, licence, equipment | Shift record + truck profile |

## The loop that replaces the phone call
```
New pickup (dispatcher form, customer app, or TMS)
  → shortlist trucks nearby / passing by / heading back       (math, ms)
  → for each: space at that moment? equipment? hours? keeps all other promises?
  → rank: earliest pickup, on-time delivery, smallest detour, best fill
  → dispatcher sees top 3 with reasons → one tap "Send"
  → driver (Samsara): OK, or ask to decline with a reason → dispatcher approves or keeps it
  → plan and ETAs update live
  → declined / no answer: next best automatically
  → nobody fits: relay, next-day via depot, or partner — shown with reasons
```

## Two ideas we keep
- **Fill space smartly:** when a truck has free space and passes near pickups that are booked later today, suggest pulling them earlier ("Truck #222 has 6 skids free and passes 3 pickups"). This raises fill % without extra trucks.
- **Protect deliveries:** a new pickup is never accepted if it makes an existing delivery late. Live GPS also raises a "running late" alert early.

## Measures that prove it works (dispatcher outcomes)
| Measure | Today (from data / sponsor) | Target in demo |
|---|---|---|
| Time to assign a new pickup | Phone calls (minutes) | < 10 seconds, one tap |
| Pickups served same day | — | ↑ (shown on replay) |
| On-time delivery | 82% vs promise (Sep 29 actual) | ≥ 95% |
| Average fill | ~79% peak (actual) | ↑ without overloads |
| Overloads / wrong equipment | Found in real dispatch audit | 0 |
| Extra km per added pickup | — | shown per decision |

## Proof with their own data: "replay a real day"
The report has the **time each pickup was dispatched**. We replay Sep 29: trucks move as they really did, and each pickup appears at its real dispatch time. The system picks a truck instantly. We compare with what the dispatcher actually did (km, lateness, trucks used, fill). This is the strongest demo for judges and the sponsor.

## Revised 2-day build (focused)
**Day 1: the brain**
1. Seed data + **truck state** (position, load on board, plan, hours).
2. Python engine port: route check + insertion (+ relay and depot options).
3. **Live assignment API**: new pickup → ranked trucks with reasons. **Replay simulator** feeding real pickups at their real times.
4. WebSocket: positions, offers, status.

**Day 2: the screens + demo**
1. **Dispatcher console**: live map, new-pickup form, top-3 suggestion with one-tap send, alerts.
2. **Driver web app**: GPS share, next stops, Accept/Decline, Picked up/Delivered (updates load on board).
3. Replay results panel: system vs actual for the day.
4. Customer booking + tracking (reuse App 1 flow) — only after 1–3 work.
5. Flutter driver demo — only if time is left.

**Moved down:** morning plan stays (ported from App 1) but it is the starting point, not the headline.
