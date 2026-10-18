# Case study: one real pickup (Trans Ontario routing report, 29 Sep 2026)

**Pickup:** 111 Gibraltar Rd, Vaughan. Orders 2988947 (created in Elite Sep 28, 11:27) + 2989365 (created Sep 29, 08:01): 2 pieces, 227 + 250 = 477 lb, 1 skid spot, OVERNIGHT/LTL. Ready 09:00.

## What happened (from the data)
| Time | Event |
|---|---|
| 09:00 | Freight ready |
| 11:21–11:43 | **Truck #218** (driver 158) delivers at **145 Gibraltar Rd, 0.11 km away**. Its remaining drops total 1,424 lb (90 + 610 + 724), so ~13,576 lb free on a straight truck of 15,000 lb (size from trans-ontario.com) |
| 11:47 | **Truck #231** (driver 133) finishes its last delivery in **Owen Sound** |
| 12:08 | Pickup dispatched to **Truck #231**, which had left its last stop in Owen Sound at 11:47 (137 km straight-line from the pickup) |
| 14:44 | Truck #231 picks it up: **5 h 44 min after ready** |

## What our system would have shown at 11:21
| Option | Pickup time | Extra driving | Other stops |
|---|---|---|---|
| **Truck #218**, 0.11 km away, ~10,500 lb free (est.) | ~11:50 (after its 11:43 delivery) | ~0.1 km, ~10–15 min loading | Next 3 stops (Bolton, Brampton, Goreway pickup) shift ~15 min; none has an appointment; Goreway still before its 16:00 close |
| Truck #231, on its way back to the depot | ~14:44 | on its way | unchanged |

The dispatcher sees both in seconds and clicks one. Result: picked up **~3 h earlier (14:44 → ~11:50) with ~0.1 km extra**, and Truck #231's space stays free for other pickups on its way back.

**Fair note:** Truck #231 was driving back anyway, so the real choice was not wrong. The point is that the better option was invisible without phone calls.

## Same check across the whole day (screening)
Across **147 mid-day pickups** (dispatched 08:00–15:59) on 29 Sep:
- The assigned truck was a **median 10.8 km** away when the pickup was dispatched.
- The nearest other truck with weight room left was a **median 2.9 km** away.
- In **38%** of pickups, a truck with room was **more than 10 km closer**.

Method limits: straight-line distances; position = the truck's last visited stop; room is estimated from weights only. This screening does not yet check the other truck's promises. The full engine does (the 3 questions).

## How it fits their routine
Elite (orders) and Samsara (GPS, driver app, stop status) stay as they are. Our layer reads both, answers "which truck?" with reasons, and the dispatcher assigns in Elite as today. Only the phone calls are replaced.
