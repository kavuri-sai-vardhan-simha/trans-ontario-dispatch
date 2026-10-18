# Live dispatch prototype: how to run it and how to show it

One server, five screens, replaying a real day of Trans Ontario's data. The default is **Wed Sep 23, 2026** (45 trucks); any of the 10 days can be picked. The screens follow Trans Ontario's real chain, **orders in Elite → dispatcher → driver (Samsara)**, and only add the decision help in the middle.

| Screen | Who | Address |
|---|---|---|
| **Dispatcher** | Dispatch office | http://localhost:8000/dispatch |
| **Elite order desk (simulator)** | Office staff entering phone/email orders | http://localhost:8000/elite |
| **Driver** (inside Samsara Driver) | Driver, on a phone | http://localhost:8000/driver |
| **Plan the day** | Dispatcher, whole-day view | http://localhost:8000/plan |
| **Audience booking** (stands in for the Web Dispatch portal) | Anyone with the QR code | http://localhost:8000/book |

## 1. Start (about 2 minutes)

1. Install **Python 3.10+** from python.org (Windows: tick "Add Python to PATH").
2. Start it:
   - **Windows:** double-click `run_prototype.bat`.
   - **Mac / Linux:** `./run_prototype.sh` (or `cd backend && pip install -r requirements.txt && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`).
3. The dispatcher opens in the browser. Keep the terminal window open; close it to stop. The map needs internet.

No Node.js is needed: the web screens are already built in `web/dist/`. (To rebuild them: `cd web && npm install && npm run build`.)

### Optional: public link for phones (audience QR)
Put **cloudflared** next to this file (`live-dispatch/cloudflared.exe` on Windows, from https://github.com/cloudflare/cloudflared/releases), or have it on the PATH. On start, the server opens a free Cloudflare quick tunnel, and the **📱 Audience QR** button shows a public `https://….trycloudflare.com/book` link. It works on mobile data and any Wi-Fi. The link changes every time the server starts. Without cloudflared, the QR code uses the laptop's Wi-Fi address (same Wi-Fi only).

## 2. The dispatcher header
- **Day picker**: any of the 10 real days. Plan the day follows the same day automatically.
- **Reset**: back to the start of the day at 11:20. It clears entered orders, decisions and driver reports.
- **Play / speed / clock**: run the replay or jump to a time. Driver reminders still fire when you jump.
- **Manual vs our system**: real orders, what the dispatcher did versus our suggestion. Two modes: *Decide when freight is ready* (default) and *Same moment as dispatcher*.
- **Cost: off/on**: off (default) ranks on customer wait, extra driver minutes and km. On shows an illustrative $ score.
- **📱 Audience QR**, **Plan the day ↗**, **Elite desk ↗**, **🔔 N new**, **EN | FR**, theme.

## 3. Demo flow (3 minutes)
1. Press **Reset**. Show the **📱 Audience QR**, or book an order yourself on the **Elite desk**.
2. The order appears in the dispatcher's **New** tab. Click it: pickup and drop-off, size, service, regular customer or not.
3. **Best trucks**: each passed all three checks, with reasons. Tap any card to show that truck's path on the map. The ruled-out trucks say why.
4. **Assign**. Then:
   - The **driver** (`/driver`, pick that truck) sees the new stop and taps **OK, got it**, or raises a concern.
   - No answer in 5 minutes sends a reminder; 10 minutes, the dispatcher is told to call.
5. Open **Plan the day ↗**: the stop is on that truck's route, with the customer's name and every rule ticked. Reassign, cancel or approve a driver's concern, and every screen follows: Elite, driver, phone tracking and Plan the day.
6. **Disruptions**: open a truck → *Driver called in sick*, *Truck broke down here*, *Traffic delay*, *Freight not ready*, *Failed delivery*. Each shows the options and their effect before you apply.

## 4. What is real and what is assumed
- **Real (Trans Ontario's routing report):** trucks, drivers, stops, times, addresses, order sizes, services, customer accounts and their past orders, what the dispatcher did and when.
- **From trans-ontario.com:** truck sizes and service cutoffs.
- **Estimated:**
  - skid spots where Elite has none (marked "est.")
  - positions between stops
  - travel times, calibrated on their GPS
  - truck heights
- **Learned (optional switch):** time on site, from 1,478 real stops. The default is 12 min + 3 per skid.
- **Not connected yet:** real Elite and Samsara. The **Sync** tab shows exactly what would be sent.
- **Partner carriers:** off. The data has none.

## 5. Checks
`backend/tests/e2e_check.py` runs an end-to-end API check against a running server.
