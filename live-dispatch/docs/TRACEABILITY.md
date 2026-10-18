# Requirements traceability — challenge brief vs what we have

> **Planning record (Oct 17).** Since then, after talking with Trans Ontario: no customer app (orders stay in Elite; an Elite order desk simulator stands in), drivers can only ask to decline with a reason and the dispatcher decides, regular customers come first, cost is an optional toggle, truck sizes come from trans-ontario.com (15,000 lb straight truck). Current build: `README.md`, `docs/ARCHITECTURE.md`, `docs/DIAGRAMS.md`.

Legend: ✅ done in App 1 · 🟡 partly / simplified · ❌ missing · ➕ planned in APP_2 (REQUIREMENTS.md id)

## A. What the brief asks for

### 1. Plan the Day
| ID | Brief requirement | App 1 | APP_2 plan / gap to add |
|---|---|---|---|
| B1 | Assign shipments to suitable vehicles | ✅ every stop × truck check, regret insertion | ➕ R5 port to Python |
| B2 | Organise into feasible loads | ✅ payload + floor spots, 95% fill | keep |
| B3 | Route efficiently | ✅ insertion + local search, ~23% fewer km on sample | ➕ R22 real road times (OSRM) |
| B4 | Respect delivery commitments | ✅ appointments hard, promise times soft, late count | keep |
| B5 | Respect operational constraints | ✅ equipment, licence, HOS, pickup-before-delivery | see compliance gaps below |

### 2. Identify Potential Problems
| ID | Brief requirement | App 1 | APP_2 plan / gap |
|---|---|---|---|
| B6 | Overloaded trucks | ✅ plan + audit of real dispatch | keep |
| B7 | Incompatible equipment | ✅ 53 ft vs straight vs van, tailgate/residential | keep |
| B8 | Missing shipment information | ✅ missing weight, piece type, equipment, skids, invalid appointments flagged | keep |
| B9 | Delivery windows that can't be met | ✅ unplannable stops with reasons, late/tight warnings | ➕ R9 live "running late" alert |
| B10 | Recognise conflicts **before** they cost money | 🟡 only at plan time | ➕ R9 + R19 live issues feed during the day |

### 3. Adapt When Things Change
| ID | Brief requirement | App 1 | APP_2 plan / gap |
|---|---|---|---|
| B11 | Truck breakdown | ✅ spare truck vs redistribute, transload | ➕ R20 |
| B12 | Driver absence | ✅ spare driver (licence match) vs redistribute | ➕ R20 |
| B13 | Late shipment | ✅ late inbound freight / rush order | ➕ R20 |
| B14 | Failed delivery | ✅ re-attempt vs return to depot | ➕ R16 driver taps "Failed" |
| B15 | Cancellations | ✅ | keep |
| B16 | Delays (traffic, running late) | ❌ not simulated | **ADD**: "truck running late" disruption triggered by live position |
| B17 | Last-minute shipments | ✅ booking flow, 10+ option types, relay | ➕ R6–R8 |

### 4. Requirements & Considerations
| ID | Brief requirement | App 1 | APP_2 plan / gap |
|---|---|---|---|
| C1 | Vehicle capacity | ✅ weight + floor spots | keep |
| C2 | Legal weight limits | 🟡 payload per class only, no axle/GVW or seasonal (half-load) limits | **ADD (light)**: GVW check + flag "axle limits not modelled" |
| C3 | Driver qualifications | 🟡 AZ/DZ/G inferred; TDG certificate unknown (flagged) | **ADD**: driver profile with TDG / air-brake flags, editable |
| C4 | Working hours | 🟡 13 h drive / 14 h duty; no 30-min breaks, no 70 h/7-day cycle | **ADD**: break rule + weekly cycle check |
| C5 | Cargo securement | 🟡 95% fill margin + DG placard flag only | **ADD (light)**: securement checklist per load (straps/load bars from Elite flags) |
| C6 | Transportation regulations | 🟡 HOS + DG flags | document what is covered |
| C7 | Shipment dimensions | ❌ only skid spots (cube not in data) | **ADD**: L×W×H fields in booking; floor plan uses dimensions when given |
| C8 | Stacking restrictions | ❌ assumed never stackable | **ADD**: stackable / do-not-stack flag; DG and fragile never stacked |
| C9 | Equipment compatibility | ✅ | keep |
| C10 | Unloading order | ✅ LIFO loading plan (last stop at nose) | ➕ show in driver app |
| C11 | Delivery windows / appointments / service promises | ✅ | keep |
| C12 | Unloading needs, location restrictions | 🟡 tailgate / residential / inside delivery only | **ADD (light)**: dock vs no-dock, no-53 ft zones (downtown) |
| C13 | Connected decisions (assignment + load + route + partner together) | ✅ one engine scores all together | keep, say it in the pitch |
| C14 | Plan adjusts to events | ✅ freeze completed stops, re-plan the rest | ➕ live, from GPS |
| C15 | Missing / estimated data clearly identified | ✅ flags + "est." labels | keep |
| C16 | Explain recommendations | ✅ why this truck, alternatives, ruled-out reasons | ➕ R24 plain-language explanation (optional LLM) |
| C17 | Assumptions documented | ✅ Rules tab + README | keep |

### 5. Success measures (judging)
| ID | Measure | App 1 evidence | Gap |
|---|---|---|---|
| S1 | Delivery reliability | ✅ 116 vs 387 late stops over 10 days (same model) | show "problems caught early" count |
| S2 | Operational cost (travel, driver hours, 3rd-party) | ✅ km −23%, hours −6%, partner cost tracked | hours are worse on some days: be honest |
| S3 | Fleet capacity use | ✅ 273 vs 428 truck-days, peak fill % | show per-truck utilisation chart |
| S4 | Faster response to disruptions | ✅ options in < 1 s with comparison | measure "time to decision" in demo |
| S5 | Trust in recommendations | ✅ explanations, rules, audit | keep |
| S6 | Feasibility of plans | ✅ hard rules never broken; audit shows real plan broke them | keep |

### 6. Background facts we must respect
| ID | Fact | Status |
|---|---|---|
| F1 | Ontario **and Quebec** | 🟡 Quebec stops go to partner; no French UI. **ADD (light)**: FR labels on customer/driver app |
| F2 | Partner carriers across Canada | ✅ partner option with modelled quote |
| F3 | 300–500 shipments/day, 50+ vehicles | 🟡 sample has ~250–290 stops/day, 40–46 trucks; **ADD**: stress test at 500 shipments |
| F4 | Existing TMS (Elite) records decisions | ❌ **ADD**: "Export plan to Elite/Samsara" (CSV/JSON in their format) |
| F5 | "AI, optimisation, predictive analytics" | 🟡 optimisation only; **no AI/ML yet** — biggest pitch risk. **ADD**: travel + on-site time prediction trained on the report's ~2,500 real travel and dwell times (planned-vs-actual ETA columns are empty for our dates) |

## B. Extras we have that the brief did not ask for
| Extra | Value for judges | Keep? |
|---|---|---|
| Audit of the **real** dispatch (found overloads, wrong equipment, missed appointments) | Strong: proves the problem with their own data | Yes, headline |
| Plan vs actual benchmark across 10 days | Strong: numbers for "success" | Yes |
| Play-the-day animation | Nice demo moment | Yes |
| Customer booking app with 10+ pickup options and pricing | Shows revenue upside of spare space | Yes, but second to dispatcher story |
| 2-truck relay through transfer yards | Novel; yards are assumed | Yes, label assumption |
| Live GPS + driver app (APP_2) | Makes it real-time | Yes |
| Flutter mobile demo | Nice-to-have | Only if time |

## C. Summary
- **Covered well:** all three missions, all four named disruptions, conflict detection, explanations, data transparency.
- **Simplified (say so in the pitch):** legal weight (payload only), HOS (no breaks/weekly cycle), securement, regulations.
- **Missing, worth adding in APP_2 (priority order):**
  1. **AI/ML piece**: travel + on-site time prediction from the sponsor data (F5). The brief says "AI" in the title.
  2. **Running-late disruption** from live GPS (B16, B10).
  3. **Stacking + dimensions** in booking and loading plan (C7, C8).
  4. **HOS breaks + weekly cycle; driver TDG/air-brake profile** (C3, C4).
  5. **Export to TMS** format (F4).
  6. 500-shipment stress test (F3); French labels (F1).
- **Watch-out:** the customer app and relay are extras. The judging is on dispatcher outcomes, so lead the demo with Plan → Problems → Adapt, then show booking as the bonus.
