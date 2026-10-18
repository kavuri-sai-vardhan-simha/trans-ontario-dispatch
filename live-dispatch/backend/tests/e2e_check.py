"""End-to-end check of the backend: booking -> options -> assign -> sync log -> tracking -> driver report -> breakdown.
Run with the server up:  python tests/e2e_check.py http://127.0.0.1:8000"""
import json, sys, urllib.request as U

B = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"


def get(p):
    return json.load(U.urlopen(B + p))


def post(p, d):
    r = U.Request(B + p, data=json.dumps(d).encode(), headers={"Content-Type": "application/json"})
    return json.load(U.urlopen(r))


post("/api/clock", {"action": "jump", "value": 680})
pl = get("/api/places")
sh = next(p for p in pl if "GIBRALTAR" in p["a"])
co = [p for p in pl if p["city"] == "Toronto"][3]
b = post("/api/bookings", {"shipper": {"name": "Acme Parts", "address": sh["a"], "city": sh["city"], "lat": sh["lat"], "lng": sh["lng"]},
                           "consignee": {"name": "Bolt Supply", "address": co["a"], "city": co["city"], "lat": co["lat"], "lng": co["lng"]},
                           "pieces": 2, "weight": 900, "spots": 2, "service": "SAME DAY"})
print("booked", b)
o = get(f"/api/orders/{b['pid']}/options")
print("options", o["n_ok"], [(x["veh"], x["reasons"][0]) for x in o["ok"][:3]], [g["reason"] for g in o["no"]])
u = o["ok"][0]["u"]
print("assign", post(f"/api/orders/{b['pid']}/assign", {"u": u}))
for e in get("/api/events"):
    print("  event", e["kind"], "|", e["text"])
t = get(f"/api/track/{b['ordno']}")
print("track", t["order"]["status"], t["order"]["truck"], t.get("truck"))
d = get(f"/api/trucks/{u}")
print("inserted in plan", [(s["a"], round(s["arr"])) for s in d["plan"] if s["ins"]], "offer", d["offer"])
print("space report", post(f"/api/driver/{u}/space", {"free": 2}), "-> free spots now", round(get(f"/api/trucks/{u}")["free_sp"], 1))
print("offer reply", post(f"/api/driver/{u}/offer", {"accept": True}))
bp = get("/api/trucks/5/breakdown")
print("breakdown preview", {k: bp.get(k) for k in ("veh", "dels", "pks", "rescue", "moves", "err")})
print("breakdown apply", post("/api/trucks/5/breakdown", {}))
print("jump", post("/api/clock", {"action": "jump", "value": 760})["label"])
print("warnings", [w["txt"] for w in get("/api/warnings")][:6])
print("gaps", len(get("/api/gaps")))
print("compare", get("/api/compare?mode=same"))
print("services at 12:40", {k: (v["open"], v["why"]) for k, v in get("/api/services")["services"].items()})
try:
    post("/api/bookings", {"shipper": {"name": "Late Co", "address": sh["a"], "lat": sh["lat"], "lng": sh["lng"]}, "consignee": {"name": "X", "address": co["a"], "lat": co["lat"], "lng": co["lng"]}, "pieces": 1, "weight": 100, "spots": 1, "service": "SAME DAY"})
except Exception as e:
    print("late same-day booking:", e)
print("refused:", post("/api/bookings", {"shipper": {"name": "Late Co", "address": sh["a"], "lat": sh["lat"], "lng": sh["lng"]}, "consignee": {"name": "X", "address": co["a"], "lat": co["lat"], "lng": co["lng"]}, "pieces": 1, "weight": 100, "spots": 1, "service": "SAME DAY"}))
