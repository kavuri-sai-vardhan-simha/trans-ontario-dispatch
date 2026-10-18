"""
Build the Sep 29 replay file for the APP_2 live demo.

Reads the sponsor's routing report and writes one JS file with:
  trucks  : each driver of the day, vehicle, class and every real stop in time order
            (depot starts/returns, pickups, deliveries) with real arrive/depart times,
            weight and skid spots (estimated where Elite left them blank, and flagged)
  pickups : each customer pickup stop of the day, with when the order was entered,
            when the freight was ready, when the real dispatcher gave it to a driver,
            and which truck really did it and when
Nothing is invented: every time and location comes from the report. Estimates are flagged.

Usage:  python build_replay.py <routing-report.xlsx> <out.js> [YYYY-MM-DD]
"""
import sys, json
import pandas as pd

SRC, OUT = sys.argv[1], sys.argv[2]
DAY = sys.argv[3] if len(sys.argv) > 3 else "2026-09-29"
x = pd.read_excel(SRC, sheet_name=["stops", "order_legs", "driver_days"])
S, L, DD = x["stops"], x["order_legs"], x["driver_days"]
# returning customers: orders each billing customer (Elite CUST_ID) placed on the days before DAY in this report
LA = L.copy(); LA["d"] = LA.service_date.astype(str).str[:10]
PAST = LA[LA.d < DAY].groupby("tms_CUST_ID").ordno.nunique().to_dict()
PAST_DAYS = sorted(LA[LA.d < DAY].d.unique())
# driver hours in the 6 days before DAY (Canadian cycle 1: 70 h on duty in 7 days): driving + on-duty-not-driving from Samsara HOS
DD["d"] = DD.day.astype(str).str[:10]
_prev = sorted(d for d in DD.d.unique() if d < DAY)[-6:]
CYCLE = DD[DD.d.isin(_prev)].assign(tot=lambda z: z.hos_drive_min.fillna(0) + z.hos_on_duty_min.fillna(0)).groupby("driver_id").tot.sum().to_dict()
S = S[S.service_date.astype(str).str[:10] == DAY].copy()
L = L[L.service_date.astype(str).str[:10] == DAY].copy()
D0 = pd.Timestamp(DAY)

def m(ts):
    """minutes after midnight of DAY (negative = day before); None if missing"""
    if pd.isna(ts):
        return None
    return round((pd.Timestamp(ts) - D0).total_seconds() / 60, 1)

def vclass(v):
    if v.startswith("Tractor"): return "TT"
    if v.startswith("Truck"): return "ST"
    return "VAN" if v else None

def est_spots(w, pcs, ptypes):
    skids = any(k in (ptypes or "") for k in ("SKD", "PLT"))
    return float(max(1, pcs)) if skids else round(max(0.25, w / 1500), 2)

trucks = []
for did, g in S.sort_values("actual_arr_local").groupby("driver_id", sort=False):
    veh = next((v.split(", ")[0] for v in g.vehicles if isinstance(v, str) and v), "")
    vc = vclass(veh)
    flags = []
    cust = g[g.stop_type == "customer"]
    if not vc:
        eq = " ".join(e for e in cust.equipment_requested if isinstance(e, str)).upper()
        vc = "TT" if "53FT" in eq or "TRACTOR" in eq else "ST"
        veh = f"Unit {g.driver_code.iloc[0]}"
        flags.append("Vehicle not in the asset log: type guessed from the freight it carried")
    stops = []
    for _, r in g.iterrows():
        st = {"k": {"warehouse_start": "S", "warehouse_return": "R"}.get(r.stop_type, "P" if r.kind == "PICKUP" else "D"),
              "rt": str(r.route_id), "lat": round(float(r.lat), 5), "lng": round(float(r.lng), 5),
              "arr": m(r.actual_arr_local), "dep": m(r.actual_dep_local)}
        if r.stop_type == "customer":
            w = float(r.weight_lb) if pd.notna(r.weight_lb) else 0
            pcs = int(r.pieces) if pd.notna(r.pieces) else 0
            pt = r.piece_types if isinstance(r.piece_types, str) else ""
            we = w <= 1
            if we:
                w = max(1, pcs) * (600 if any(k in pt for k in ("SKD", "PLT")) else 25)
            sp = float(r.skid_spots) if pd.notna(r.skid_spots) and r.skid_spots > 0 else None
            se = sp is None
            if se:
                sp = est_spots(w, pcs, pt)
            lg = L[(L.route_id == r.route_id) & (L.stop_id == r.stop_id)]
            ccol = "tms_SH_CITY" if r.kind == "PICKUP" else "tms_RC_CITY"
            city = str(lg[ccol].dropna().iloc[0]).title() if len(lg) and lg[ccol].notna().any() else ""
            svc_l = [v for v in lg.tms_SERVICE.dropna()] if len(lg) else []
            svc_s = svc_l[0] if svc_l else (str(r.services).split(",")[0].strip() if isinstance(r.services, str) else "")
            flag = lambda col: bool(len(lg) and lg[col].fillna(0).astype(float).max() > 0)
            st.update({"tdg": flag("tms_DNGRGDS"), "tg": flag("tms_TAILGATE") or flag("tms_RESIDENT"), "straps": flag("tms_STRAPS")})
            st.update({"svc": svc_s, "city": city, "o": str(r.orders), "c": str(r.consignee), "a": str(r.address).strip(),
                       "w": round(w), "we": we, "sp": sp, "se": se, "pc": pcs,
                       "eq": r.equipment_requested if isinstance(r.equipment_requested, str) else "",
                       "appt": m(r.appt_local)})
        stops.append(st)
    trucks.append({"id": int(did), "code": str(g.driver_code.iloc[0]), "name": str(g.driver_name.iloc[0]),
                   "veh": veh, "vc": vc, "f": flags, "stops": stops, "cycle_min": round(float(CYCLE.get(did, 0)), 1)})

# pickups: one per pickup stop (several orders can share a stop)
P = L[(L.stop_type == "customer") & (L.action == "P")]
pickups = []
for (rid, sid), g in P.groupby(["route_id", "stop_id"]):
    tr = next((t for t in trucks if t["id"] == int(g.driver_id.iloc[0])), None)
    if tr is None:
        continue
    st = next((s for s in tr["stops"] if s["k"] == "P" and s["rt"] == str(rid) and s.get("o") and
               str(g.ordno.iloc[0]) in s["o"]), None)
    if st is None:
        continue
    entered = min((m(v) for v in g.tms_OTIME_local if pd.notna(v)), default=None)
    ready = max((m(v) for v in g.tms_READYDATE_local if pd.notna(v)), default=None)
    given = min((m(v) for v in g.dispatch_ts_local if pd.notna(v)), default=None)
    # same-day delivery of the same order (Rush / Same Day): the pickup and its delivery must stay on one truck
    drop = None
    bases_p = [o.strip()[:-1] for o in st["o"].split(",") if o.strip()]
    for t2 in trucks:
        for k2, s2 in enumerate(t2["stops"]):
            if s2["k"] == "D" and any((b + "D") in s2.get("o", "") for b in bases_p) and s2.get("arr") is not None and st.get("arr") is not None and s2["arr"] > st["arr"]:
                drop = {"truck": t2["id"], "o": s2["o"], "a": s2["a"], "c": s2["c"], "lat": s2["lat"], "lng": s2["lng"], "w": s2["w"], "sp": s2["sp"], "appt": s2["appt"], "arr": s2["arr"]}
                break
        if drop:
            break
    svc = str(g.tms_SERVICE.dropna().iloc[0]) if g.tms_SERVICE.notna().any() else ""
    cust = str(g.tms_CUST_ID.dropna().iloc[0]) if g.tms_CUST_ID.notna().any() else ""
    taker = str(g.tms_TAKER.dropna().iloc[0]) if g.tms_TAKER.notna().any() else ""
    channel = "Web Dispatch portal" if taker.upper().startswith("WEB") else ("Scanned" if taker.upper() == "SCANNER" else "Entered by staff (phone/email)")
    pickups.append({"id": len(pickups), "svc": svc, "drop": drop, "cust": cust, "past": int(PAST.get(cust, 0)), "channel": channel, "o": st["o"], "c": st["c"], "a": st["a"],
                    "city": str(g.tms_SH_CITY.dropna().iloc[0]).title() if g.tms_SH_CITY.notna().any() else "",
                    "lat": st["lat"], "lng": st["lng"], "w": st["w"], "we": st["we"], "sp": st["sp"], "se": st["se"],
                    "eq": st["eq"], "tdg": st.get("tdg", False), "tg": st.get("tg", False), "entered": entered, "ready": ready, "given": given,
                    "act": {"truck": tr["id"], "arr": st["arr"], "dep": st["dep"]}})
pickups.sort(key=lambda p: (p["given"] if p["given"] is not None else 9e9))
for i, p in enumerate(pickups):
    p["id"] = i

# spare drivers: on the roster in this report, did not work on DAY; licence inferred from what they drove (flagged)
worked = set(DD[(DD.d == DAY) & (DD.n_stops > 0)].driver_id)
spares = []
for did, g in DD[DD.n_stops > 0].groupby("driver_id"):
    if did in worked or "test" in str(g.driver_name.iloc[0]).lower():
        continue
    vs = " ".join(v for v in g.vehicles.dropna())
    lic = "AZ" if "Tractor" in vs else ("DZ" if "Truck" in vs else None)
    spares.append({"id": int(did), "code": str(g.driver_code.iloc[0]), "name": str(g.driver_name.iloc[0]), "lic": lic,
                   "days": int(g.d.nunique()), "lic_note": "inferred from vehicles driven" if lic else "unknown (never seen in a vehicle)"})

customers = sorted(({"id": k, "past": int(v)} for k, v in PAST.items()), key=lambda c: -c["past"])
out = {"day": DAY, "spares": spares, "past_days": PAST_DAYS, "customers": customers, "source": SRC.replace("\\", "/").split("/")[-1],
       "depot": {"name": "Trans Ontario depot", "a": "2215 Markham Rd, Scarborough", "lat": 43.808, "lng": -79.242},
       "trucks": trucks, "pickups": pickups}
with open(OUT, "w", encoding="utf-8") as f:
    if OUT.endswith(".json"):
        json.dump(out, f, separators=(",", ":"))
    else:
        f.write("window.REPLAY = " + json.dumps(out, separators=(",", ":")) + ";\n")
live = [p for p in pickups if p["given"] is not None and p["given"] >= 420]
print(f"{DAY}: {len(trucks)} trucks, {sum(len(t['stops']) for t in trucks)} stops, {len(pickups)} pickup stops "
      f"({len(live)} given out during the day after 07:00)")
