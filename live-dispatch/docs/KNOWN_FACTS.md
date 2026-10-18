# What we know (and only what we know)

We can't ask Trans Ontario anything. Everything in the design must come from these three sources. Anything else is an assumption and must be labelled.

## Sources
- **B** = Challenge brief (Smarter Freight, Smarter Routes)
- **D** = Their data: routing report + driver-day summary, Sep 20 – Oct 3, 2026
- **W** = Their website, trans-ontario.com (read 2026-10-17)
- **R** = Trans Ontario representative, told to us directly

## Facts
| Topic | Fact | Source |
|---|---|---|
| Size | ~300–500 shipments/day, 50+ vehicles, Ontario + Quebec, rest of Canada via partner carriers | B |
| Systems | Orders live in **Elite TMS**; dispatcher assigns each pickup/delivery leg **by hand**; integration turns it into **Samsara** routes | D (README) |
| Systems | TMS records decisions and sends routes to drivers but "does not automatically determine the best plan" | B |
| Driver side | Samsara GPS marks arrivals/departures (99.8% of stops); stops auto-sequenced; status sent back to Elite | D |
| Driver side | Orders are dispatched "to the assigned driver electronically" | W |
| Depots | **One** depot/terminal: 2215 Markham Rd, Scarborough. Every route starts/ends there. No other yard appears | D |
| Overnight | Overnight freight is stored "in our warehouse temporarily" and delivered next business day | W |
| Hand-offs | 447 of 705 two-leg orders changed truck or day via the depot; 258 were picked up and delivered by the same truck the same day | D |
| Booking channels | **Phone** (GTA ext 2, Canada ext 3, USA ext 1), **email** (gta@, canada@, usdispatch@, CSR@), **Web Dispatch** customer portal, **tracking** portal | W |
| Services | Same day, Rush (GTA), Overnight, After hours (by phone), Out of town; LTL/TL; temperature-controlled, hazmat, oversized, tailgate | W, D |
| Fleet | Cars, vans, 26 ft straight trucks, tractors + 53 ft trailers | W, D |
| Truck sizes | Single-axle straight 12 skids / 15,000 lb · Tandem-axle straight 12 skids / 28,000 lb · Tandem 53' trailer 26 skids / 44,000 lb · Tri-axle 53' 26 skids / 64,000 lb | W |
| Free wait time | Straight trucks: first 30 min free · 53' trailers: first hour free (matches data: typical stop 18 min straight, 52 min tractor) | W, D |
| Service cutoffs | Rush: pickup before 3:30 pm · Out of town: pickup before 1:30 pm · Same day (9am–5pm): order by 12 pm, pickup before 5 pm · Overnight: order by 3:30 pm, pickup before 5 pm · After hours (after 4 pm): call in | W |
| Service on each order | Elite records it (tms_SERVICE): LTL, Overnight, Rush, Same day, Out of town, After hours, Flat bed… | D |
| Same-day pairs | Sep 29: 26 of 185 pickup legs (mostly Rush / Same day) were picked up and delivered the same day by the same truck; they must move together | D |
| Timing | 81% of pickups booked the same day they are collected (97% ready that day); 82% assigned 09:00–15:00 while trucks are out; routes updated ~6×/day on average (median 3) | D |
| Manual step | Dispatchers phone drivers for location and space before assigning | R |
| Why they call | Their tracking view is outdated: it can show a truck at its last stop (e.g. Owen Sound) after it has already left | R |
| Consistent with data | Elite gets a truck's status only when a stop is arrived/completed (status files, once per stop); the TMS copy lags up to an hour; live GPS sits in Samsara | D (README) |

## What this means for the design
1. **No transfer yards.** The depot is the only hand-off point (overnight service).
2. **No new customer app needed.** Customers already book by phone, email and Web Dispatch. All of these end up in Elite. Our layer reads new orders from Elite, whatever the channel.
3. **No new driver app needed.** Samsara already delivers jobs and marks stops. Our driver screen is only a demo stand-in for Samsara.
4. **The gap we fill:** choosing the truck for each new pickup (today by phone calls), plus early warnings.
5. **Where AI helps for real:** reading booking **emails** into an order draft for the CSR; predicting travel and on-site times from ~2,500 real stops in the data.

## Design rule from R
Use **live GPS** (Samsara) for truck positions, never Elite's last-stop status. Between pings, estimate the position along the route and show how fresh it is ("last seen 2 min ago"). Flag a truck as stale after 10 min without a ping.

## Still assumptions (label them in the demo)
- Which units are single- vs tandem-axle (data doesn't say): we use the safer limits, 15,000 lb straight and 44,000 lb 53'. The cargo van's size (2,000 lb, 2 spots) is assumed.
- LTL (in Elite, not on the website) treated like Overnight: pickup before 5 pm. Same-day freight delivered by 5 pm unless the delivery has an appointment.
- Driver licence classes (inferred from vehicles driven).
- Exact Web Dispatch → Elite flow (website shows a portal; we assume it feeds Elite).
- The few addresses with many pickups and drops (e.g. 1865 Clements Rd Pickering, 71/81 Maybrook Dr Scarborough) may be partner terminals or big customers. Unknown; treated as customers.
