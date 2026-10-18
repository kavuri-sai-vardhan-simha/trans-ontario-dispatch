"""Every customer address in the routing report (all days, not just the replay day), for the order entry pickers.
Usage: python scripts/build_places.py <routing-report.xlsx>   ->  data/processed/places.json"""
import json, os, re, sys
import pandas as pd

x = pd.read_excel(sys.argv[1], sheet_name=["stops", "order_legs"])
S, L = x["stops"], x["order_legs"]
S = S[(S.stop_type == "customer") & S.lat.notna()]
city = {}
for r in L.itertuples():
    c = r.tms_SH_CITY if r.kind == "PICKUP" else r.tms_RC_CITY
    if isinstance(c, str):
        city[(r.route_id, r.stop_id)] = c.title()
seen, out = set(), []
for r in S.itertuples():
    a = re.sub(r"\s+", " ", str(r.address)).strip()
    k = a.upper()
    if k in seen:
        continue
    seen.add(k)
    out.append({"a": a, "city": city.get((r.route_id, r.stop_id), ""), "lat": round(float(r.lat), 5), "lng": round(float(r.lng), 5),
                "days": int(S[S.address == r.address].service_date.astype(str).str[:10].nunique())})
out.sort(key=lambda p: p["a"])
dst = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "processed", "places.json")
json.dump(out, open(dst, "w"), separators=(",", ":"))
print(len(out), "addresses ->", dst)
