"""Speed test at Trans Ontario's full volume: 500 new pickups in one day (the brief: 300-500 shipments a day, 50+ vehicles).

Takes the real Sep 29 day (46 trucks) and adds 500 pickups at real Sep 29 addresses with real order sizes, arriving
through the day. Each one goes through the full check (all trucks, every place in their route, 3 questions) and is
assigned to the best truck, so the routes fill up as the day goes on. Reports how long one decision takes.
Usage: python scripts/stress_test.py [n]   (default 500)  ->  data/processed/stress.json
"""
import json, os, random, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from app.core import config as C
from app.engine.replay import Replay

N = int(sys.argv[1]) if len(sys.argv) > 1 else 500
data = json.load(open(C.DATA_FILE, encoding="utf-8"))
R = Replay(data)
random.seed(29)
src = [p for p in data["pickups"]]
times, placed = [], 0
for i in range(N):
    p = dict(random.choice(src))
    T = 7 * 60 + (i / N) * (15 * 60 + 30 - 7 * 60)                   # orders arrive 07:00 - 15:30
    p.update(o=f"S{i}P", ordno=f"S{i}", entered=T, ready=T, given=None, drop=None, svc="OVERNIGHT", past=0, act=None)
    pk = R.add_pickup(p)
    t0 = time.perf_counter(); res = R.options(pk["id"], T); times.append(time.perf_counter() - t0)
    if res["ok"]:
        R.assign(pk["id"], res["ok"][0], T); placed += 1
times.sort()
out = {"orders": N, "trucks": len(R.trucks), "placed_on_a_truck": placed, "no_truck": N - placed,
       "ms_median": round(times[len(times) // 2] * 1000), "ms_p95": round(times[int(len(times) * 0.95)] * 1000),
       "ms_max": round(times[-1] * 1000), "total_s": round(sum(times), 1)}
json.dump(out, open(os.path.join(os.path.dirname(C.DATA_FILE), "stress.json"), "w"))
print(json.dumps(out))
