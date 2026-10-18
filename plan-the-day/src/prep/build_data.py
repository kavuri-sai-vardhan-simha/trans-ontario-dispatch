"""
Build data.js for the Trans Ontario dispatch-planning prototype.

Reads the sponsor's anonymised routing report (stops, order_legs, driver_days sheets)
and writes one compact JSON blob per operating day:
  - jobs   : one row per customer stop (pickup or delivery) with freight, equipment,
             handling, time windows, data-quality flags and what actually happened
  - pairs  : same-day pickup -> delivery links (pickup must precede delivery on one truck)
  - units  : driver + vehicle combinations that worked that day (the day's fleet)
  - spares : drivers on the roster who did not work that day (for "driver sick" recovery)
Every estimated value carries a flag so the UI can show it as estimated.

Usage:  python build_data.py <routing-report.xlsx> <out/data.js>
"""
import sys, json, math, re
import pandas as pd

SRC, OUT = sys.argv[1], sys.argv[2]
x = pd.read_excel(SRC, sheet_name=["stops", "order_legs", "driver_days"])
S, L, DD = x["stops"], x["order_legs"], x["driver_days"]

DEPOT = {"name": "Trans Ontario depot", "addr": "2215 Markham Rd, Scarborough, ON M1B 2W3",
         "lat": 43.8080, "lng": -79.2420}

def day_of(v):
    return str(v)[:10]

def mins(ts, day):
    if pd.isna(ts):
        return None
    if str(ts)[:10] != day:
        return None
    return int(ts.hour) * 60 + int(ts.minute)

def vclass(v):
    if not isinstance(v, str) or not v:
        return None
    if v.startswith("Tractor"):
        return "TT"
    if v.startswith("Truck"):
        return "ST"
    return "VAN"

S["day"] = S.service_date.map(day_of)
L["sday"] = L.service_date.map(day_of)
DD["dday"] = DD.day.map(day_of)
cust = S[S.stop_type == "customer"].copy()
legs = L[L.stop_type == "customer"].copy()
days = sorted(d for d in cust.day.unique() if pd.Timestamp(d).weekday() < 5 and (cust.day == d).sum() > 50)

# ---------- driver licence inferred from vehicles driven across the whole period ----------
first_vehicle = DD.vehicles.fillna("").str.split(", ").str[0]
lic = {}
for did, grp in DD.assign(v=first_vehicle).groupby("driver_id"):
    vs = set(grp.v) - {""}
    if any(v.startswith("Tractor") for v in vs):
        lic[did] = ("AZ", False)
    elif any(v.startswith("Truck") for v in vs):
        lic[did] = ("DZ", False)
    elif vs:
        lic[did] = ("G", False)
    else:
        lic[did] = ("DZ", True)  # never seen in a vehicle -> assumed, flagged
ALL_VEH = sorted(v for v in set(first_vehicle) if v and vclass(v) in ("ST", "TT"))
names = DD.sort_values("driver_name").groupby("driver_id")[["driver_code", "driver_name"]].first()

def eq_need(e):
    e = (e or "").upper()
    if any(k in e for k in ("53FT", "TRACTOR", "FTL", "FLAT")) and "TRUCK" not in e:
        return "TT"
    if e and all(any(k in part for k in ("CAR", "VAN", "GROUND", "HATCH", "FWD")) for part in e.split(", ")):
        return "ANY"
    return "ST"

out = {"depot": DEPOT, "generated_from": SRC.split("/")[-1], "days": {}}
for day in days:
    cd = cust[cust.day == day].sort_values(["driver_id", "actual_arr_local"]).reset_index(drop=True)
    ld = legs[legs.sday == day]
    jobs = []
    stop_index = {}
    for i, r in cd.iterrows():
        flags = []
        sid = r.stop_id
        stop_index[(r.route_id, sid)] = i
        my = ld[(ld.route_id == r.route_id) & (ld.stop_id == sid)]
        t = {"PICKUP": "P", "DROP-OFF": "D"}.get(r.kind, "D")
        if r.kind == "MULTI":
            flags.append(["info", "Co-located pickup + drop-off: modelled as a delivery stop"])
        pcs = int(r.pieces) if pd.notna(r.pieces) else 0
        ptypes = r.piece_types if isinstance(r.piece_types, str) else ""
        skids = any(k in ptypes for k in ("SKD", "PLT"))
        w = float(r.weight_lb) if pd.notna(r.weight_lb) else 0.0
        w_est = False
        if w <= 1:
            w = max(1, pcs) * (600 if skids else 25)
            w_est = True
            flags.append(["warn", f"Weight missing in Elite (≤1 lb) — estimated {int(w):,} lb from {pcs} {ptypes or 'pcs'}"])
        if w > 44000:
            flags.append(["crit", f"Weight {int(w):,} lb exceeds the legal payload of any unit (44,000 lb) — verify or split"])
        sp = float(r.skid_spots) if pd.notna(r.skid_spots) and r.skid_spots > 0 else None
        sp_est = False
        if sp is None:
            sp_est = True
            sp = float(max(1, pcs)) if skids else round(max(0.25, w / 1500), 2)
            if skids or w > 300:
                flags.append(["info", f"Skid spots not recorded — estimated {sp:g}"])
        if not ptypes:
            flags.append(["warn", "Piece type missing"])
        eqr = r.equipment_requested if isinstance(r.equipment_requested, str) else ""
        if not eqr:
            flags.append(["warn", "Requested equipment missing — assumed straight truck"])
        hand = r.special_handling if isinstance(r.special_handling, str) else ""
        svc = r.services if isinstance(r.services, str) else ""
        # time windows (minutes after midnight)
        appt = mins(r.appt_local, day)
        ready = None
        due = None
        if len(my):
            rd = [mins(v, day) for v in my.tms_READYDATE_local]
            rd = [v for v in rd if v is not None]
            ready = max(rd) if (rd and t == "P") else None
            ap = [mins(v, day) for v in my.tms_APPTIME_local]
            ap = [v for v in ap if v is not None and 420 <= v <= 1140]
            if t == "D" and ap:
                due = min(ap)
        if ready is not None and ready < 420:
            ready = None
        city = ""
        if len(my):
            col = "tms_SH_CITY" if t == "P" else "tms_RC_CITY"
            cv = my[col].dropna()
            city = str(cv.iloc[0]).title() if len(cv) else ""
        prov = ""
        if len(my):
            col = "tms_SH_PROV" if t == "P" else "tms_RC_PROV"
            pv = my[col].dropna()
            prov = str(pv.iloc[0]) if len(pv) else ""
        late = None
        arr = mins(r.actual_arr_local, day) if pd.notna(r.actual_arr_local) else None
        jobs.append({
            "id": i, "t": t, "o": r.orders, "c": r.consignee, "a": r.address, "city": city, "prov": prov,
            "lat": round(float(r.lat), 5), "lng": round(float(r.lng), 5),
            "w": round(w), "we": w_est, "pc": pcs, "pt": ptypes, "sp": sp, "se": sp_est,
            "lf": float(r.linear_feet) if pd.notna(r.linear_feet) else None,
            "svc": svc, "eqr": eqr, "eq": eq_need(eqr), "h": hand,
            "appt": appt, "rdy": ready, "due": due,
            "f": flags,
            "act": {"drv": int(r.driver_id), "arr": arr, "rt": str(r.route_name),
                    "dep": mins(r.actual_dep_local, day) if pd.notna(r.actual_dep_local) else None,
                    "km": round(float(r.leg_actual_m) / 1000, 1) if pd.notna(r.leg_actual_m) else None,
                    "st": r.state},
        })
    # same-day pickup -> delivery pairs (share an order number)
    pairs, used = [], set()
    by_order = {}
    for j in jobs:
        for o in str(j["o"]).split(","):
            o = o.strip()
            if o:
                by_order.setdefault(o[:-1], {}).setdefault(o[-1], j["id"])
    for ordno, m in by_order.items():
        if "P" in m and "D" in m and m["P"] != m["D"]:
            p, d = m["P"], m["D"]
            if p in used or d in used:
                continue
            if jobs[p]["t"] == "P" and jobs[d]["t"] == "D":
                pairs.append([p, d]); used.update([p, d])
    # fleet of the day
    dd = DD[(DD.dday == day) & (DD.n_stops > 0)]
    units, seen_v = [], set()
    for _, r in dd.iterrows():
        v = r.vehicles.split(", ")[0] if isinstance(r.vehicles, str) else ""
        vc = vclass(v)
        flags = []
        if not vc:
            act = [j for j in jobs if j["act"]["drv"] == r.driver_id]
            vc = "TT" if any(j["eq"] == "TT" for j in act) else ("VAN" if act and all(j["eq"] == "ANY" for j in act) else "ST")
            v = f"Unit {r.driver_code or r.driver_id} (unrecorded)"
            flags.append("Vehicle not in the asset log — class inferred from the freight it carried")
        if v in seen_v:
            v = v + " (2nd driver)"
        seen_v.add(v)
        l, l_est = lic.get(r.driver_id, ("DZ", True))
        if vc == "TT" and l != "AZ":
            l, l_est = "AZ", True
        if l_est:
            flags.append("Licence class not on file — inferred")
        units.append({"did": int(r.driver_id), "code": str(r.driver_code or ""), "name": str(r.driver_name),
                      "veh": v, "vc": vc, "trl": r.trailers if isinstance(r.trailers, str) else "",
                      "lic": l, "f": flags,
                      "act": {"km": round(float(r.actual_dist_km), 1) if pd.notna(r.actual_dist_km) else None,
                              "first": mins(r.first_arr_local, day), "last": mins(r.last_dep_local, day),
                              "duty": round(float(r.hos_on_duty_min)) if pd.notna(r.hos_on_duty_min) else None}})
    working = set(dd.driver_id)
    spares = []
    for did, (l, est) in lic.items():
        if did in working or did not in names.index:
            continue
        nm, cd = names.loc[did, "driver_name"], names.loc[did, "driver_code"]
        if not isinstance(nm, str):
            continue
        spares.append({"did": int(did), "code": str(cd) if pd.notna(cd) else "", "name": nm, "lic": l, "est": est})
    used_v = {u["veh"] for u in units}
    spare_veh = [{"veh": v, "vc": vclass(v)} for v in ALL_VEH if v not in used_v]
    out["days"][day] = {"jobs": jobs, "pairs": pairs, "units": units, "spares": spares, "spareVeh": spare_veh}
    print(day, len(jobs), "jobs", len(pairs), "pairs", len(units), "units", len(spares), "spares")

with open(OUT, "w") as fh:
    fh.write("window.TO_DATA=" + json.dumps(out, separators=(",", ":"), default=str) + ";")
