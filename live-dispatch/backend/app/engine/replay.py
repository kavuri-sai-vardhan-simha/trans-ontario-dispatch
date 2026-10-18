"""The decision engine.

Knows, at any clock time, where each truck is, what is on board and how much room is left,
and answers the 3 questions for a new pickup on every truck:
  1. Is there room on board (weight and floor spots) until the freight reaches the depot?
  2. Can the truck get there before the shipper closes?
  3. Does everyone else on that truck stay on time, and the driver within 14 h?
Trucks that pass all 3 are ranked by cost: extra km + extra driver minutes + customer wait.

Truck movement comes from the Sep 29 routing report (stand-in for Samsara GPS).
Orders come from Elite (real Sep 29 pickups, plus new bookings).
"""
from __future__ import annotations
import copy, json, math, re
from ..core import config as C


# ---------------- travel model (same as App 1) ----------------
def hav(a, b):
    la1, la2 = math.radians(a["lat"]), math.radians(b["lat"])
    dla, dlo = la2 - la1, math.radians(b["lng"] - a["lng"])
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


# ---------------- Lake Ontario: draw trips around it, not across it ----------------
# The report has stop times, not GPS tracks, so a truck between two stops is drawn on a line. A line from the
# Niagara side to the Toronto side would cross the lake: those trips go around the west end (Burlington) instead.
LAKE = [(43.30, -79.78), (43.38, -79.70), (43.47, -79.61), (43.545, -79.52), (43.60, -79.43), (43.62, -79.37), (43.64, -79.30), (43.67, -79.22), (43.75, -79.12), (43.80, -78.98), (43.84, -78.80), (43.88, -78.50), (43.93, -78.10), (43.97, -77.50),
        (43.27, -77.50), (43.30, -78.50), (43.30, -79.05), (43.27, -79.25), (43.27, -79.55), (43.29, -79.72)]
LAKE_N = {"lat": 43.35, "lng": -79.80}         # Burlington (north end of the Skyway / QEW)
LAKE_S = {"lat": 43.25, "lng": -79.82}         # Hamilton (south end)


def _in_lake(lat, lng):
    inside, n = False, len(LAKE)
    for i in range(n):
        (y1, x1), (y2, x2) = LAKE[i], LAKE[i - 1]
        if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def _south(p):
    return p["lat"] < 43.33           # south / west of the lake (Niagara, Hamilton)


def path(a, b):
    """Points to draw a trip from a to b: straight, or around the west end of Lake Ontario when it goes between
    the Niagara side and the Toronto side and the straight line would cross the water."""
    if _south(a) != _south(b) and any(_in_lake(a["lat"] + (b["lat"] - a["lat"]) * f, a["lng"] + (b["lng"] - a["lng"]) * f) for f in (0.2, 0.35, 0.5, 0.65, 0.8)):
        return [a, LAKE_S, LAKE_N, b] if _south(a) else [a, LAKE_N, LAKE_S, b]
    return [a, b]


def along(pts, f):
    """Point at fraction f (0..1) of the way along a list of points."""
    segs = [hav(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    total = sum(segs) or 1
    d = max(0.0, min(1.0, f)) * total
    for i, s in enumerate(segs):
        if d <= s or i == len(segs) - 1:
            g = d / s if s else 0
            a, b = pts[i], pts[i + 1]
            return {"lat": a["lat"] + (b["lat"] - a["lat"]) * g, "lng": a["lng"] + (b["lng"] - a["lng"]) * g}
        d -= s
    return pts[-1]


def travel(a, b):
    h = hav(a, b)
    if h < 0.05:
        return 0.0, 0.0
    v = 18 + 37 * (min(1, h / 50) ** 0.7)
    return h * C.CIRCUITY, h / v * 60 + 2           # (km, minutes)


def svc(sp, mx=C.SVC_MAX):
    """Minutes at a stop: 12 + 3 per skid spot, capped by the truck type's free wait time (30 min straight, 60 min 53')."""
    return min(mx, C.SVC_BASE + C.SVC_PER_SPOT * (sp or 0))


# ---------------- on-site time, learned from real stops (scripts/train_dwell.py) ----------------
try:
    DWELL = json.load(open(C.DWELL_FILE))
except OSError:
    DWELL = None


def _addr_key(a):
    return re.sub(r"\s+", " ", str(a or "")).strip().upper()


def _bucket(sp):
    sp = sp or 1
    return "1" if sp <= 1 else "2-3" if sp <= 3 else "4-7" if sp <= 7 else "8+"


MODE = {"onsite": C.ONSITE_MODE}


def onsite(kind, a, sp, fallback_max=C.SVC_MAX):
    """Minutes at a stop and where the number comes from: the standard rule, or learned from real stops (switch)."""
    if not DWELL or MODE["onsite"] != "learned":
        return svc(sp, fallback_max), "rule", 0
    base = (DWELL["by_bucket"].get(f"{kind}|{_bucket(sp)}") or [svc(sp, fallback_max), 0])[0]
    h = DWELL["by_addr"].get(f"{kind}|{_addr_key(a)}")
    if h:
        return (h[0] * h[1] + base * DWELL["k"]) / (h[1] + DWELL["k"]), "address", h[1]
    return base, "size", 0


def fmt_t(m):
    if m is None:
        return "—"
    m = round(m)
    if m < 0:                      # freight ready the day before
        return "yesterday " + fmt_t(m + 1440)
    return f"{m // 60:02d}:{m % 60:02d}"


def short(a):
    a = re.sub(r"\s+", " ", str(a or "")).strip()
    m = re.match(r"^(.*?)(?:\s+ON\b|\s+CAN\b|,)", a, re.I)
    s = (m.group(1) if m else a)[:40]
    return " ".join(w[:1].upper() + w[1:].lower() for w in s.split(" "))


def bases(o):
    return [s.strip()[:-1] for s in str(o or "").split(",") if s.strip()]


class Replay:
    def __init__(self, data: dict, wait_per_min: float | None = None):
        self.data = data
        self.depot = data["depot"]
        self.wait_per_min = C.WAIT_PER_MIN if wait_per_min is None else wait_per_min
        self.rank_mode = C.RANK_MODE
        self.pickups = copy.deepcopy(data["pickups"])
        self.trucks = []
        for i, t in enumerate(copy.deepcopy(data["trucks"])):
            t["i"] = i
            t["cls"] = C.CLASSES.get(t["vc"], C.CLASSES["ST"])
            t["stops"] = [s for s in t["stops"] if s.get("arr") is not None]   # skipped stops have no time
            for s in t["stops"]:
                if s.get("dep") is None:
                    s["dep"] = s["arr"]
                if s["k"] in "PD" and "w" not in s:      # "orphan" stop in Samsara with no order behind it: no freight
                    s.update(w=0, sp=0, se=False, we=False, a="Unlisted stop (no order in Elite)", c="", o="", appt=None)
            for k, s in enumerate(t["stops"]):
                s["k0"], s["pa"], s["pd"] = k, s["arr"], s["dep"]
            self.trucks.append(t)
        by_id = {t["id"]: t for t in self.trucks}
        for p in self.pickups:
            p.setdefault("src", "elite")
            t = by_id.get(p["act"]["truck"]) if p.get("act") else None
            p["real_truck"] = t["i"] if t else None
            p["real_stop"] = next((k for k, s in enumerate(t["stops"]) if s["k"] == "P" and s.get("o") == p["o"]), -1) if t else -1
            if p.get("drop"):
                dt = by_id.get(p["drop"].get("truck"))
                p["drop"]["u"] = dt["i"] if dt else None
        self.reset()

    # ---------- deadlines (Trans Ontario service levels) ----------
    @staticmethod
    def pickup_by(pk):
        sv = C.service(pk.get("svc"))
        if sv.get("call_in"):
            return sv["pickup_by"]
        return min(pk.get("close") or C.CLOSE, sv["pickup_by"])

    @staticmethod
    def deliver_by(pk):
        d = pk.get("drop")
        if not d:
            return None
        if d.get("appt") is not None:
            return d["appt"] + C.APPT_GRACE
        return max(C.SAME_DAY_DELIVER_BY, d.get("arr") or 0)

    def reset(self):
        self.moved = {}      # pickup id -> our decision {u, at, arr, dep, km, delay, before_k0}
        self.down = {}       # truck -> {t, lat, lng}
        self.space = {}      # truck -> driver's report {t, free, calc, rt}
        self.gps = {}        # truck -> simulated Samsara gap {from, to}
        self.hold = {}       # truck -> {t, until, lat, lng, who}: stopped until a spare driver takes over
        self.spares_used = set()
        self.delays = {}     # truck -> [{t, min, why}]: traffic, waiting for freight
        self.cancelled = set()   # pickup ids cancelled in Elite
        self.failed = set()      # (truck, k0, pid) deliveries that failed (freight stays on board)
        self.retries = {}        # truck -> [{key, t}]: re-attempt a failed delivery later today
        for t in self.trucks:
            t["plan"] = [dict(s) for s in t["stops"]]

    # ---------- new orders from Elite (bookings) ----------
    def add_pickup(self, p: dict) -> dict:
        p = dict(p)
        p["id"] = len(self.pickups)
        p.setdefault("src", "booking")
        p["real_truck"], p["real_stop"], p["act"], p["given"] = None, -1, None, None
        self.pickups.append(p)
        return p

    # ---------- the plan each truck follows now ----------
    def owner(self, pid):
        m = self.moved.get(pid)
        if m:
            return m["u"]
        return self.pickups[pid]["real_truck"]

    def _removed(self, u):
        """Stops on truck u's real route that our decisions moved to another truck (pickup, and its same-day delivery)."""
        out = set()
        for pid in self.cancelled:
            pk = self.pickups[pid]
            if pk.get("real_truck") == u:
                out.add(("P", pk["o"]))
            d = pk.get("drop")
            if d and d.get("u") == u and d.get("o"):
                out.add(("D", d["o"]))
        for pid, m in self.moved.items():
            pk = self.pickups[pid]
            if m["u"] == u:
                continue
            if pk.get("real_truck") == u:
                out.add(("P", pk["o"]))
            d = pk.get("drop")
            if d and d.get("u") == u and d.get("o"):
                out.add(("D", d["o"]))
        return out

    def rebuild(self, u):
        if u is None or u < 0:
            return
        t = self.trucks[u]
        gone = self._removed(u)
        plan = [dict(s, arr=s["pa"], dep=s["pd"]) for s in t["stops"] if (s["k"], s.get("o")) not in gone]
        mine = sorted(((pid, m) for pid, m in self.moved.items() if m["u"] == u and pid not in self.cancelled), key=lambda x: x[1]["arr"])
        for pid, m in mine:
            pk = self.pickups[pid]
            at = next((k for k, s in enumerate(plan) if not s.get("ins") and s["k0"] >= m["before_k0"]), None)
            if at is None:
                at = next((k for k, s in enumerate(plan) if s["k"] == "R" and s["pa"] >= m["arr"]), len(plan))
            ref = plan[at] if at < len(plan) else (plan[at - 1] if plan else {})
            ins = {"k": "P", "ins": True, "pid": pid, "o": pk["o"], "c": pk["c"], "a": pk["a"], "lat": pk["lat"], "lng": pk["lng"],
                   "w": pk["w"], "sp": pk["sp"], "se": pk["se"], "we": pk["we"], "rt": ref.get("rt"), "appt": None, "svc": pk.get("svc"), "tdg": pk.get("tdg"), "tg": pk.get("tg"),
                   "arr": m["arr"], "dep": m["dep"], "pa": m["arr"], "pd": m["dep"], "k0": -1}
            plan.insert(at, ins)
            for s in plan[at + 1:]:
                s["arr"] += m["delay"]; s["dep"] += m["delay"]
            d = m.get("d")
            if d:
                dk = pk["drop"]
                at2 = next((k for k, s in enumerate(plan) if k > at and not s.get("ins") and s["k0"] >= d["before_k0"]), None)
                if at2 is None:
                    at2 = next((k for k, s in enumerate(plan) if k > at and s["k"] in "RS"), len(plan))
                ref2 = plan[at2 - 1]
                insd = {"k": "D", "ins": True, "pid": pid, "o": dk.get("o") or pk["o"].replace("P", "D"), "c": dk["c"], "a": dk["a"], "lat": dk["lat"], "lng": dk["lng"],
                        "w": pk["w"], "sp": pk["sp"], "se": pk["se"], "we": pk["we"], "rt": ref2.get("rt"), "appt": dk.get("appt"), "svc": pk.get("svc"),
                        "arr": d["arr"], "dep": d["dep"], "pa": d["arr"], "pd": d["dep"], "k0": -1}
                plan.insert(at2, insd)
                for s in plan[at2 + 1:]:
                    s["arr"] += d["delay"]; s["dep"] += d["delay"]
        # failed deliveries stay on board; a re-attempt goes before the truck heads back to the depot
        for s in plan:
            if (u, s["k0"], s.get("pid")) in self.failed:
                s["failed"] = True
        for r in self.retries.get(u, []):
            j0 = next((j for j, s in enumerate(plan) if (u, s["k0"], s.get("pid")) == r["key"]), None)
            if j0 is None:
                continue
            o = plan[j0]
            j = next((j for j in range(j0 + 1, len(plan)) if plan[j]["k"] in "RS" or plan[j]["rt"] != o["rt"]), len(plan))
            prev = plan[j - 1]; nxt = plan[j] if j < len(plan) else self.depot
            leave = max(prev["dep"], r["t"])
            a_min = travel(prev, o)[1]; arr = leave + a_min; dep = arr + svc(o.get("sp"), t["cls"]["svc_max"])
            dl = (dep - prev["dep"]) + travel(o, nxt)[1] - travel(prev, nxt)[1]
            plan.insert(j, dict(o, ins=True, retry=True, failed=False, k0=-2, arr=arr, dep=dep, pa=arr, pd=dep))
            for s in plan[j + 1:]:
                s["arr"] += dl; s["dep"] += dl
        shifts = ([{"t": self.hold[u]["t"], "min": self.hold[u]["until"] - self.hold[u]["t"]}] if self.hold.get(u) else []) + self.delays.get(u, [])
        for h in shifts:
            dl = h["min"]
            for s in plan:
                if s["arr"] >= h["t"]:
                    s["arr"] += dl; s["dep"] += dl
                elif s["dep"] > h["t"]:
                    s["dep"] += dl
        t["plan"] = plan

    # ---------- load on board ----------
    def _route_start_load(self, plan, k):
        rt, w, sp, est, picked = plan[k]["rt"], 0.0, 0.0, False, set()
        for s in plan[k:]:
            if s["rt"] != rt or s["k"] == "R":
                break
            if s["k"] == "P":
                picked.update(bases(s.get("o")))
            if s["k"] == "D" and not s.get("retry") and not any(o in picked for o in bases(s.get("o"))):
                w += s["w"]; sp += s["sp"]; est = est or s["se"] or s["we"]
        return {"w": w, "sp": sp, "est": est}

    def loads(self, plan):
        out, cur, rt = [], {"w": 0, "sp": 0, "est": False}, None
        for k, s in enumerate(plan):
            if s["k"] == "S" or s["rt"] != rt:
                cur = self._route_start_load(plan, k); rt = s["rt"]
            if s["k"] == "P":
                cur = {"w": cur["w"] + s["w"], "sp": cur["sp"] + s["sp"], "est": cur["est"] or s["se"] or s["we"]}
            elif s["k"] == "D" and not s.get("failed"):
                cur = {"w": max(0, cur["w"] - s["w"]), "sp": max(0, cur["sp"] - s["sp"]), "est": cur["est"] or s["se"] or s["we"]}
            elif s["k"] == "R":
                cur = {"w": 0, "sp": 0, "est": False}
            out.append(cur)
        return out

    def end_of_day(self, plan):
        last = plan[-1]
        return last["arr"] if last["k"] == "R" else last["dep"] + travel(last, self.depot)[1]

    def _tap_adj(self, st, rt):
        tap = st.get("tap")
        return (tap["calc"] - tap["free"]) if tap and rt == tap["rt"] else 0.0

    # ---------- where is the truck now ----------
    def state(self, u, T):
        t = self.trucks[u]; plan = t["plan"]; cls = t["cls"]
        empty = {"w": 0, "sp": 0, "est": False}
        if not plan:
            return {"u": u, "T": T, "plan": plan, "k": -1, "next": None, "status": "done", "pos": self.depot,
                    "label": "No stops left", "on": empty, "free": {"w": cls["cap"], "sp": cls["spots"] * C.FILL_MAX, "est": False},
                    "fill": 0, "loads": [], "duty_start": 0, "duty_used": 0, "duty_end": 0, "src": "Samsara", "samsara_age": 1, "tap": None}
        first, last = plan[0], plan[-1]
        loads = self.loads(plan)
        k = -1
        for j, s in enumerate(plan):
            if s["arr"] <= T:
                k = j
        nxt = k + 1 if k + 1 < len(plan) else None
        st = {"u": u, "T": T, "plan": plan, "k": k, "next": nxt, "loads": loads}
        home_min = travel(last, self.depot)[1]
        if u in self.down and T >= self.down[u]["t"]:
            st.update(status="down", pos=self.down[u], label=(self.down[u].get("why") or "Broken down") + " since " + fmt_t(self.down[u]["t"]))
        elif u in self.hold and self.hold[u]["t"] <= T < self.hold[u]["until"]:
            h = self.hold[u]
            st.update(status="held", pos={"lat": h["lat"], "lng": h["lng"]}, label=f"Waiting for spare driver {h['who']} (takes over {fmt_t(h['until'])})")
        elif T < first["arr"]:
            st.update(status="before", pos=self.depot, label="Not started yet (starts " + fmt_t(first["arr"]) + ")")
        elif T > last["dep"] + 1 and not (last["k"] != "R" and T < last["dep"] + home_min):
            st.update(status="done", pos=self.depot, label="Finished for the day")
        elif k >= 0 and T <= plan[k]["dep"]:
            s = plan[k]
            lab = {"S": "At the depot, loading", "R": "Back at the depot"}.get(s["k"]) or (("Picking up at " if s["k"] == "P" else "Delivering at ") + short(s.get("a")))
            st.update(status="stop", pos={"lat": s["lat"], "lng": s["lng"]}, label=lab)
        elif nxt is not None:
            a, b = plan[k], plan[nxt]
            f = (T - a["dep"]) / max(1, b["arr"] - a["dep"])
            st.update(status="moving", pos=along(path(a, b), f),
                      label="Driving to " + ("the depot" if b["k"] in "RS" else short(b.get("a"))))
        else:
            f = min(1, (T - last["dep"]) / max(1, home_min))
            st.update(status="home", pos=along(path(last, self.depot), f),
                      label="Heading back to the depot")
        on = loads[k] if k >= 0 else empty
        if st["status"] == "stop":
            on = loads[k] if plan[k]["k"] == "S" else (loads[k - 1] if k > 0 else on)
        elif st["status"] in ("done", "before"):
            on = empty
        elif st["status"] == "home":
            on = loads[-1]
        on = dict(on)
        tap = self.space.get(u)
        st["tap"] = None
        if tap and T >= tap["t"] and k >= 0 and plan[k]["rt"] == tap["rt"]:
            st["tap"] = tap
            on["sp"] = max(0, on["sp"] + tap["calc"] - tap["free"]); on["est"] = False
        st["on"] = on
        st["free"] = {"w": cls["cap"] - on["w"], "sp": cls["spots"] * C.FILL_MAX - on["sp"], "est": on["est"]}
        st["fill"] = max(on["w"] / cls["cap"], on["sp"] / cls["spots"])
        st["duty_start"] = first["arr"]
        st["duty_used"] = max(0, min(T, last["dep"]) - first["arr"])
        st["duty_end"] = self.end_of_day(plan)
        g = self.gps.get(u)
        if g and g["from"] <= T < g["to"]:
            st["src"], st["samsara_age"] = "Driver phone", T - g["from"]
        else:
            st["src"], st["samsara_age"] = "Samsara", 1
        return st

    # ---------- the 3 questions on one truck ----------
    def try_truck(self, u, pk, T):
        st = self.state(u, T); t = self.trucks[u]; plan = st["plan"]; cls = t["cls"]

        def no(msg):
            return {"u": u, "ok": False, "why": msg}

        if st["status"] == "down":
            return no("Broken down")
        if st["status"] == "held":
            return no("Waiting for a spare driver")
        if st["status"] == "done":
            return no("Finished for the day")
        if st["status"] == "before":
            return no("Not on the road yet")
        eq = pk.get("eq") or ""
        if re.search(r"53|TRACTOR|FTL|FLAT", eq, re.I) and not re.search("TRUCK", eq, re.I) and t["vc"] != "TT":
            return no("Needs a 53' trailer")
        if pk["w"] > cls["cap"]:
            return no(f"Too heavy for a {cls['label'].lower()} ({cls['cap']:,} lb max)")
        if pk.get("tg") and not cls.get("tailgate"):
            return no(f"Needs a tailgate (no dock): a {cls['label'].lower()} has none")
        if pk.get("h_in") and pk["h_in"] > cls.get("h_in", 999):
            return no(f"Too tall: {pk['h_in']:.0f} in, {cls['label'].lower()} inside is ~{cls['h_in']} in")
        ready = max(pk["ready"] if pk.get("ready") is not None else C.DAY_START, C.DAY_START)
        close = self.pickup_by(pk)
        drop = pk.get("drop"); d_by = self.deliver_by(pk)
        sv_p, sv_src, sv_n = onsite("P", pk.get("a"), pk["sp"], cls["svc_max"])
        best, first_fail = None, None
        k = st["k"]
        from_k = k + 1 if st["status"] == "stop" else (st["next"] if st["next"] is not None else len(plan))
        cap_w, cap_sp = cls["cap"], cls["spots"] * C.FILL_MAX
        n = len(plan)

        def load_at(j):          # on board after stop j, with the driver's space report applied
            return st["loads"][j]["w"], max(0, st["loads"][j]["sp"] + self._tap_adj(st, plan[j]["rt"]))

        def late_count(i, d1, j=None, d2=0.0):
            broken, worse, at = 0, 0, None
            for q in range(i, n):
                s = plan[q]
                if s["k"] in "RS":
                    continue
                add = d1 + (d2 if j is not None and q >= j else 0)
                lim = s["appt"] + C.APPT_GRACE if s.get("appt") is not None else C.CLOSE
                if s["arr"] <= lim < s["arr"] + add:
                    broken += 1; at = at or s
                elif s["arr"] > lim and add > 0:
                    worse += 1
            return broken, worse, at

        for i in range(from_k, n + 1):
            if i == from_k:
                prev = plan[k] if st["status"] == "stop" else st["pos"]
                leave = max(T, plan[k]["dep"]) if st["status"] == "stop" else T
            else:
                prev = plan[i - 1]; leave = plan[i - 1]["dep"]
                if prev["k"] == "R":
                    continue
            nxt = plan[i] if i < n else None
            a_km, a_min = travel(prev, pk)
            b_km, b_min = travel(pk, nxt or self.depot)
            c_km, c_min = travel(prev, nxt or self.depot)
            arr = max(leave + a_min, ready); dep = arr + sv_p
            wait = max(0, ready - (leave + a_min))
            dP = max(0, wait + a_min + sv_p + b_min - c_min)
            kmP = max(0, a_km + b_km - c_km)
            # Q2: in time for the service level (Rush 15:30, Out of town 13:30, others 17:00) and the shipper's hours
            if arr > close:
                first_fail = first_fail or f"Can't pick up before {fmt_t(close)} ({C.service(pk.get('svc'))['label']} cutoff; earliest {fmt_t(arr)})"
                continue
            if i == from_k:
                on_w, on_sp = st["on"]["w"], st["on"]["sp"]
            else:
                on_w, on_sp = load_at(i - 1)
            cands = []
            if not drop:
                # Q1: room from here until the freight is dropped at the depot
                max_w, max_sp = on_w, on_sp
                for j in range(i, n):
                    s = plan[j]
                    if s["k"] in "RS" or (j > i and s["rt"] != plan[j - 1]["rt"]):
                        break
                    lw, ls = load_at(j); max_w = max(max_w, lw); max_sp = max(max_sp, ls)
                if max_w + pk["w"] > cap_w:
                    first_fail = first_fail or f"No room: {max(0, cap_w - max_w):,.0f} lb free, needs {pk['w']:,.0f}"; continue
                if max_sp + pk["sp"] > cap_sp:
                    first_fail = first_fail or f"No floor space: {max(0, cap_sp - max_sp):.1f} spots free, needs {pk['sp']:g}"; continue
                cands.append({"km": kmP, "delay": dP, "d": None, "free_w": cap_w - max_w, "free_sp": cap_sp - max_sp, "late": late_count(i, dP)})
            else:
                # same-day order: its delivery goes on the same truck, after the pickup and before the depot
                max_w, max_sp = on_w, on_sp
                room_fail = None
                for j in range(i, n + 1):
                    if j > i:
                        lw, ls = load_at(j - 1); max_w = max(max_w, lw); max_sp = max(max_sp, ls)
                        if plan[j - 1]["k"] in "RS":
                            break
                    if max_w + pk["w"] > cap_w:
                        room_fail = f"No room: {max(0, cap_w - max_w):,.0f} lb free, needs {pk['w']:,.0f}"; break
                    if max_sp + pk["sp"] > cap_sp:
                        room_fail = f"No floor space: {max(0, cap_sp - max_sp):.1f} spots free, needs {pk['sp']:g}"; break
                    dprev = pk if j == i else plan[j - 1]
                    dleave = dep if j == i else plan[j - 1]["dep"] + dP
                    dnext = plan[j] if j < n else self.depot
                    x_km, x_min = travel(dprev, drop); y_km, y_min = travel(drop, dnext); z_km, z_min = travel(dprev, dnext)
                    sv_d = onsite("D", drop.get("a"), pk["sp"], cls["svc_max"])[0]
                    d_arr = dleave + x_min
                    if d_arr > d_by:
                        first_fail = first_fail or f"Can't deliver to {short(drop['a'])} by {fmt_t(d_by)} (same-day)"
                        break
                    dD = max(0, x_min + sv_d + y_min - z_min)
                    nxt_real = next((s for s in plan[j:] if not s.get("ins")), None)
                    cands.append({"km": kmP + max(0, x_km + y_km - z_km), "delay": dP + dD,
                                  "d": {"arr": d_arr, "dep": d_arr + sv_d, "delay": dD, "before_k0": nxt_real["k0"] if nxt_real else 10 ** 9, "a": drop["a"]},
                                  "free_w": cap_w - max_w, "free_sp": cap_sp - max_sp, "late": late_count(i, dP, j, dD)})
                if not cands:
                    first_fail = first_fail or room_fail or "No room to carry it to the delivery"
                    continue
            for c in cands:
                broken, worse, b_at = c["late"]
                if broken:
                    when = f"appt {fmt_t(b_at['appt'])}" if b_at.get("appt") is not None else "closes 17:00"
                    first_fail = first_fail or f"Would make {broken} other stop{'s' if broken > 1 else ''} late ({short(b_at.get('a'))}, {when})"
                    continue
                if st["duty_end"] + c["delay"] - st["duty_start"] > C.MAX_DUTY:
                    first_fail = first_fail or "Driver would pass 14 h on duty"
                    continue
                if t.get("cycle_min", 0) + st["duty_end"] + c["delay"] - st["duty_start"] > C.MAX_CYCLE:
                    first_fail = first_fail or f"Driver would pass 70 h on duty in 7 days ({t.get('cycle_min', 0) / 60:.0f} h in the last 6 days)"
                    continue
                wait_min = arr - max(T, ready)
                pw = C.PRIORITY_WEIGHT[C.tier(pk.get("past", 0))]
                if self.rank_mode == "cost":       # illustrative $ view (toggle)
                    cost = c["km"] * cls["per_km"] + c["delay"] * cls["per_hr"] / 60 + wait_min * self.wait_per_min * pw + worse * C.LATE_STOP_PEN * 0.25
                else:                              # no prices: customer wait + extra driver minutes + extra km (+ pushing late stops later)
                    cost = wait_min * pw + c["delay"] + c["km"] + worse * 100
                nx_real = next((s for s in plan[i:] if not s.get("ins")), None)
                cand = {"u": u, "ok": True, "i": i, "arr": arr, "dep": dep, "km": c["km"], "delay": c["delay"], "dP": dP, "wait": wait, "cost": cost,
                        "worse": worse, "prev": {"lat": prev["lat"], "lng": prev["lng"], "a": prev.get("a")},
                        "before_k0": nx_real["k0"] if nx_real else 10 ** 9, "d": c["d"],
                        "free_w": c["free_w"], "free_sp": c["free_sp"], "est": st["on"]["est"],
                        "checked": sum(1 for s in plan[i:] if s["k"] in "PD"), "onsite": sv_p, "onsite_src": sv_src, "onsite_n": sv_n}
                if best is None or cost < best["cost"]:
                    best = cand
        return best or no(first_fail or "No place in its route")

    def options(self, pid, T):
        pk = self.pickups[pid]
        saved = self.moved.get(pid); owner = self.owner(pid)
        du = (pk.get("drop") or {}).get("u")
        self.moved[pid] = {"u": -1}
        self.rebuild(owner)
        if du is not None and du != owner:
            self.rebuild(du)
        res = [self.try_truck(u, pk, T) for u in range(len(self.trucks))]
        if saved:
            self.moved[pid] = saved
        else:
            del self.moved[pid]
        self.rebuild(owner)
        if du is not None and du != owner:
            self.rebuild(du)
        ok = sorted((r for r in res if r["ok"]), key=lambda r: r["cost"])
        order = lambda r: 0 if re.search("room|floor", r["why"], re.I) else 1 if re.search("late|close|14 h|before|deliver", r["why"]) else 2 if re.search("53|heavy", r["why"]) else 3 if "Broken" in r["why"] else 4
        nos = sorted((r for r in res if not r["ok"]), key=order)
        for o in ok:
            o["reasons"] = self.reasons(o, pk, T)
        return {"pk": pk, "T": T, "ok": ok, "no": nos, "real": self.real_outcome(pid)}

    def conflicts(self, pid, o, T, radius_km=25):
        """Would giving this truck to this order take the room a waiting regular customer nearby needs from the same truck?"""
        pk = self.pickups[pid]
        if C.tier(pk.get("past", 0)) == "regular":
            return []
        out = []
        for q, s in self.feed(T):
            if s != "waiting" or q["id"] == pid or C.tier(q.get("past", 0)) != "regular" or hav(q, pk) > radius_km:
                continue
            if (q.get("ready") or 0) > T:          # not ready yet: no conflict now
                continue
            res = self.try_truck(o["u"], q, T)
            if not res.get("ok"):
                continue
            room_w, room_sp = o["free_w"] - pk["w"], o["free_sp"] - pk["sp"]
            if q["w"] > room_w or q["sp"] > room_sp:
                out.append({"pid": q["id"], "a": short(q["a"]), "past": q.get("past", 0), "waiting": T - max(q.get("ready") or 0, self.known(q))})
        return sorted(out, key=lambda x: -x["waiting"])[:2]

    def reasons(self, o, pk, T):
        r = []
        near = hav(o["prev"], pk)
        if o["km"] < 3:
            r.append(f"Already next door: {near * 1000:.0f} m from its stop" if near < 0.5 else f"On its way: +{o['km']:.1f} km")
        else:
            r.append(f"+{o['km']:.1f} km extra driving")
        r.append(f"Room: {o['free_w']:,.0f} lb · {o['free_sp']:.1f} spots free" + (" (estimated)" if o["est"] else ""))
        r.append(f"Picks up at {fmt_t(o['arr'])}" + (f", freight ready since {fmt_t(pk['ready'])}" if pk.get("ready") is not None and pk["ready"] < T else "")
                 + f" (before the {fmt_t(self.pickup_by(pk))} {C.service(pk.get('svc'))['label']} cutoff)")
        if o.get("d"):
            r.append(f"Delivers to {short(o['d']['a'])} at {fmt_t(o['d']['arr'])}, same day")
        r.append((f"Its next {o['checked']} stop" + ("s stay" if o["checked"] > 1 else " stays") + " on time" + (f" (+{round(o['delay'])} min)" if o["delay"] >= 1 else ""))
                 if o["checked"] else "No other stops affected")
        if o.get("onsite") is not None:
            r.append(f"On site ~{o['onsite']:.0f} min (" + (f"learned from {o['onsite_n']} past visit{'s' if o['onsite_n'] != 1 else ''} here" if o.get("onsite_src") == "address" else "typical for this size of pickup" if o.get("onsite_src") == "size" else "standard rule") + ")")
        if pk.get("tdg"):
            r.append("Dangerous goods (TDG): driver's TDG certificate is not in the data, confirm before sending; never stacked")
        return r

    def real_outcome(self, pid):
        pk = self.pickups[pid]
        if pk.get("real_truck") is None or pk["real_stop"] < 0:
            return None
        s = self.trucks[pk["real_truck"]]["stops"]; k = pk["real_stop"]
        prev = s[k - 1] if k > 0 else self.depot
        nxt = s[k + 1] if k + 1 < len(s) else self.depot
        km = max(0, travel(prev, s[k])[0] + travel(s[k], nxt)[0] - travel(prev, nxt)[0])
        d = pk.get("drop")
        if d and d.get("u") == pk["real_truck"]:      # same-day delivery on the real truck: count its detour too
            kd = next((j for j, x in enumerate(s) if x["k"] == "D" and x.get("o") == d.get("o")), None)
            if kd is not None:
                pv = s[kd - 1] if kd > 0 else self.depot; nx = s[kd + 1] if kd + 1 < len(s) else self.depot
                km += max(0, travel(pv, s[kd])[0] + travel(s[kd], nx)[0] - travel(pv, nx)[0])
        return {"u": pk["real_truck"], "given": pk["given"], "arr": pk["act"]["arr"], "km": km}

    def assign(self, pid, o, T):
        prev_owner = self.owner(pid)
        self.moved[pid] = {"u": o["u"], "at": T, "arr": o["arr"], "dep": o["dep"], "km": o["km"], "delay": o.get("dP", o["delay"]), "before_k0": o["before_k0"], "d": o.get("d")}
        self.rebuild(o["u"])
        if prev_owner != o["u"]:
            self.rebuild(prev_owner)
        d = self.pickups[pid].get("drop")
        if d and d.get("u") is not None and d["u"] not in (o["u"], prev_owner):
            self.rebuild(d["u"])

    # ---------- incoming orders ----------
    def known(self, pk):
        return max(C.DAY_START, pk["entered"] if pk.get("entered") is not None else C.DAY_START)

    def status(self, pk, T):
        """waiting = in Elite, no truck yet · assigned = we gave it a truck · given = the real dispatcher gave it out (history)
           picked = freight on a truck · future = not entered yet"""
        if T < self.known(pk):
            return "future"
        if pk["id"] in self.cancelled:
            return "cancelled"
        m = self.moved.get(pk["id"])
        if m and m["u"] < 0:
            return "waiting"          # taken off its truck (freight not ready): needs a truck again
        if m:
            return "picked" if T >= m["dep"] else "assigned"
        if pk.get("given") is not None and pk["given"] <= T:
            act = pk.get("act") or {}
            dep = act.get("dep") if act.get("dep") is not None else act.get("arr")
            return "picked" if dep is not None and T >= dep else "given"
        return "waiting"

    def feed(self, T):
        out = []
        for pk in self.pickups:
            if pk.get("given") is not None and pk["given"] < C.DAY_START and pk["id"] not in self.moved:
                continue        # planned the day before
            s = self.status(pk, T)
            if s not in ("future", "cancelled"):
                out.append((pk, s))
        return out

    # ---------- warnings ----------
    def warnings(self, T):
        out = []
        for t in self.trucks:
            u = t["i"]; st = self.state(u, T)
            if st["status"] in ("done", "before"):
                continue
            if st["status"] == "down":
                left = [s for s in st["plan"][st["k"] + 1:] if s["k"] in "PD"]
                out.append({"lvl": "crit", "u": u, "txt": f"{t['veh']} broken down: {len(left)} stops left, {st['on']['w']:,.0f} lb on board"})
                continue
            start = st["k"] + 1 if st["status"] == "stop" else st["next"]
            if start is not None:
                prev = st["plan"][st["k"]] if st["status"] == "stop" else st["pos"]
                eta = max(T, st["plan"][st["k"]]["dep"]) if st["status"] == "stop" else T
                for j in range(start, len(st["plan"])):
                    s = st["plan"][j]
                    eta += travel(prev, s)[1]
                    if s.get("appt") is not None and s["k"] in "PD" and s["appt"] + C.APPT_GRACE >= T:
                        if eta > s["appt"] + C.APPT_GRACE and s["appt"] - T < 120:
                            out.append({"lvl": "warn", "u": u, "txt": f"{t['veh']} running late for {short(s.get('a'))} (appt {fmt_t(s['appt'])}, ETA {fmt_t(eta)})"})
                        break
                    eta += svc(s.get("sp"))
                    prev = s
            if st["duty_used"] > 12.5 * 60:
                out.append({"lvl": "warn", "u": u, "txt": f"{t['veh']}: driver at {st['duty_used'] / 60:.1f} h on duty (limit 14 h)"})
            if st["src"] == "Driver phone":
                out.append({"lvl": "info", "u": u, "txt": f"{t['veh']}: no Samsara update for {st['samsara_age']:.0f} min, using the driver's phone"})
            if st["tap"] and abs(st["tap"]["calc"] - st["tap"]["free"]) > 2:
                out.append({"lvl": "info", "u": u, "txt": f"{t['veh']}: driver reports {st['tap']['free']:g} spots free, we estimated {st['tap']['calc']:.1f}. Check order sizes"})
        for pk, s in self.feed(T):
            if s == "waiting" and self.pickup_by(pk) - T <= 60 and self.pickup_by(pk) >= T:
                out.append({"lvl": "crit", "pid": pk["id"], "txt": f"{C.service(pk.get('svc'))['label']} pickup {short(pk['a'])} must happen by {fmt_t(self.pickup_by(pk))} ({self.pickup_by(pk) - T:.0f} min left)"})
            elif s == "waiting" and pk.get("ready") is not None and T - max(pk["ready"], self.known(pk)) > 120:
                out.append({"lvl": "warn", "pid": pk["id"], "txt": f"Pickup {short(pk['a'])} ready for {(T - max(pk['ready'], self.known(pk))) / 60:.1f} h with no truck"})
        return out

    def gaps(self, T, max_km=5):
        out = []
        for pk, s in self.feed(T):
            if s != "waiting":
                continue
            ok = self.options(pk["id"], T)["ok"]
            if ok and ok[0]["km"] <= max_km:
                out.append({"pid": pk["id"], "u": ok[0]["u"], "km": ok[0]["km"], "arr": ok[0]["arr"]})
        return sorted(out, key=lambda g: g["km"])

    # ---------- breakdown ----------
    def breakdown(self, u, T, allow_before=False):
        st = self.state(u, T)
        morning = allow_before and st["status"] == "before"
        if st["status"] not in ("moving", "stop", "held") and not morning:
            return {"err": f"That truck isn't on the road at {fmt_t(T)}"}
        plan = st["plan"]
        frm = 0 if morning else (st["k"] + 1 if st["status"] in ("stop", "held") else st["next"])
        frm = len(plan) if frm is None else frm
        left = [s for s in plan[frm:] if s["k"] in "PD"]
        dels = [s for s in left if s["k"] == "D"]; pks = [s for s in left if s["k"] == "P"]
        site = {"lat": st["pos"]["lat"], "lng": st["pos"]["lng"]}
        if morning:          # still at the depot: its load is the first route's deliveries
            st["on"] = dict(self._route_start_load(plan, 0)) if plan else {"w": 0, "sp": 0, "est": False}
        rescue = []
        for t in self.trucks:
            if t["i"] == u:
                continue
            s2 = self.state(t["i"], T)
            at_depot = s2["status"] == "before" and morning
            if not at_depot and s2["status"] not in ("moving", "stop"):
                continue
            free_w = s2["free"]["w"] if not at_depot else t["cls"]["cap"] - self._route_start_load(s2["plan"], 0)["w"]
            free_sp = s2["free"]["sp"] if not at_depot else t["cls"]["spots"] * C.FILL_MAX - self._route_start_load(s2["plan"], 0)["sp"]
            if free_w < st["on"]["w"] or free_sp < st["on"]["sp"]:
                continue
            if at_depot:
                g_km, g_min = 0.0, 0.0
                meet = max(T, s2["plan"][0]["arr"])
            else:
                g_km, g_min = travel(s2["pos"], site)
                meet = (max(T, s2["plan"][s2["k"]]["dep"]) if s2["status"] == "stop" else T) + g_min
            tt = meet + C.TRANSFER_BASE + C.TRANSFER_PER_SPOT * st["on"]["sp"]
            prev, late, km = site, 0, g_km
            for d in dels:
                x_km, x_min = travel(prev, d); tt += x_min; km += x_km
                if tt > (d["appt"] + C.APPT_GRACE if d.get("appt") is not None else C.CLOSE):
                    late += 1
                tt += svc(d["sp"]); prev = d
            km += travel(prev, s2["pos"])[0]
            rescue.append({"u": t["i"], "meet": meet, "done": tt, "late": late, "km": km, "own_delay": tt - T})
        rescue.sort(key=lambda r: (r["late"], r["own_delay"]))
        moves = []
        self.down[u] = {"t": T, **site}
        for s in pks:
            pid = s.get("pid")
            if pid is None:
                pid = next((p["id"] for p in self.pickups if p["o"] == s.get("o") and self.owner(p["id"]) == u), None)
            if pid is None:
                continue
            ok = self.options(pid, T)["ok"]
            moves.append({"pid": pid, "o": ok[0] if ok else None})
        del self.down[u]
        return {"u": u, "T": T, "site": site, "on": st["on"], "dels": len(dels), "pks": len(pks), "rescue": rescue[:3], "moves": moves,
                "morning": morning, "far": [{"a": short(s.get("a")), "k": s["k"], "km": hav(self.depot, s) * C.CIRCUITY} for s in left if hav(self.depot, s) * C.CIRCUITY > 90]}

    def apply_breakdown(self, b, rescue_idx=0, why=None):
        self.down[b["u"]] = {"t": b["T"], **b["site"], "why": why}
        for m in b["moves"]:
            if m["o"]:
                self.assign(m["pid"], m["o"], b["T"])

    # ---------- driver called in sick ----------
    def spares(self):
        return [sp for sp in self.data.get("spares", []) if sp["id"] not in self.spares_used]

    def sick(self, u, T):
        """Options when a driver can't work: a spare driver takes the same truck, share the work out, or a partner carrier."""
        st = self.state(u, T); t = self.trucks[u]
        if st["status"] in ("done", "down", "held"):
            return {"err": f"{t['veh']} has nothing left to do at {fmt_t(T)}" if st["status"] == "done" else f"{t['veh']} is already being handled"}
        morning = st["status"] == "before"
        out = {"u": u, "T": T, "veh": t["veh"], "driver": t["name"], "morning": morning, "label": st["label"]}
        # A: spare driver, same truck, same route (needs the right licence: AZ for a 53', AZ or DZ for a straight truck)
        need = ("AZ",) if t["vc"] == "TT" else ("AZ", "DZ")
        sp = next((x for x in self.spares() if x.get("lic") in need), None)
        if sp:
            CALL_IN = 30          # assumed: time for the spare to get ready
            if morning:
                until = max(T + CALL_IN, st["plan"][0]["arr"]); pos = self.depot; how = "starts from the depot"
            else:
                car = travel(self.depot, st["pos"])[1]
                until = T + CALL_IN + car; pos = st["pos"]; how = f"driven from the depot to the truck (~{car:.0f} min)"
            delay = max(0.0, until - (st["plan"][0]["arr"] if morning else T))
            start = 0 if morning else (st["k"] + 1 if st["status"] == "stop" else (st["next"] or 0))
            late = 0
            for s in st["plan"][start:]:
                if s["k"] not in "PD":
                    continue
                lim = s["appt"] + C.APPT_GRACE if s.get("appt") is not None else C.CLOSE
                if s["arr"] <= lim < s["arr"] + delay:
                    late += 1
            end = st["duty_end"] + delay
            out["spare"] = {"id": sp["id"], "code": sp["code"], "name": sp["name"], "lic": sp["lic"], "lic_note": sp["lic_note"],
                            "until": until, "delay": delay, "late": late, "how": how, "lat": pos["lat"], "lng": pos["lng"],
                            "ends": end, "assumed": "30 min to get ready (assumed)"}
        else:
            out["spare"] = None
        # B: share the work (rescue truck for freight on board + pickups through the same 3 checks)
        b = self.breakdown(u, T, allow_before=True)
        out["share"] = None if b.get("err") else b
        # C: partner carrier for far stops
        out["far"] = (b.get("far") or []) if not b.get("err") else []
        return out

    def apply_spare(self, u, T, sp):
        self.hold[u] = {"t": T, "until": sp["until"], "lat": sp["lat"], "lng": sp["lng"], "who": f"{sp['code']} {sp['name']}"}
        self.spares_used.add(sp["id"])
        self.rebuild(u)

    # ---------- live problems during the day (Mission 3) ----------
    def _pid_of(self, u, s):
        if s.get("pid") is not None:
            return s["pid"]
        return next((p["id"] for p in self.pickups if p["o"] == s.get("o") and self.owner(p["id"]) == u), None)

    def _focus(self, u, T, kind, just_done=False):
        """The stop the driver is at (or just left / goes to next) of this kind (P or D)."""
        st = self.state(u, T); plan = st["plan"]; k = st["k"]
        if k >= 0 and plan[k]["k"] == kind and not plan[k].get("failed") and (st["status"] == "stop" or (just_done and T - plan[k]["dep"] <= 15)):
            return st, k
        start = k + 1 if st["status"] == "stop" else (st["next"] if st["next"] is not None else len(plan))
        j = next((j for j in range(start, len(plan)) if plan[j]["k"] == kind and not plan[j].get("failed")), None)
        return st, j

    def _broken(self, u, T, before):
        """Stops (from now on) that are on time in `before` but late in the current plan of truck u."""
        plan = self.trucks[u]["plan"]; out = []
        old = {(s["k0"], s.get("pid"), s["k"]): s["arr"] for s in before}
        for s in plan:
            if s["k"] not in "PD" or s["arr"] < T:
                continue
            lim = s["appt"] + C.APPT_GRACE if s.get("appt") is not None else C.CLOSE
            a0 = old.get((s["k0"], s.get("pid"), s["k"]))
            if s["arr"] > lim and (a0 is None or a0 <= lim):
                out.append({"a": short(s.get("a")), "k": s["k"], "appt": s.get("appt"), "arr": s["arr"], "lim": lim})
        return out

    def _try(self, u, T, change, undo):
        """Apply a change, measure what it does to truck u, undo it."""
        before = [dict(s) for s in self.trucks[u]["plan"]]
        change(); self.rebuild(u)
        st = self.state(u, T)
        res = {"broken": self._broken(u, T, before), "end": st["duty_end"],
               "duty_h": (st["duty_end"] - st["duty_start"]) / 60, "duty_ok": st["duty_end"] - st["duty_start"] <= C.MAX_DUTY}
        undo(); self.rebuild(u)
        return res

    def delay_options(self, u, T, minutes, why="Traffic"):
        """Truck running late by N minutes: which promises break, and which pickups another truck could take instead."""
        st = self.state(u, T)
        if st["status"] not in ("moving", "stop"):
            return {"err": f"{self.trucks[u]['veh']} isn't on the road at {fmt_t(T)}"}
        d = {"t": T, "min": float(minutes), "why": why}
        res = self._try(u, T, lambda: self.delays.setdefault(u, []).append(d), lambda: self.delays[u].remove(d))
        # pickups still ahead on this truck: could another truck take them, so this one catches up?
        self.delays.setdefault(u, []).append(d); self.rebuild(u)
        moves = []
        start = st["k"] + 1 if st["status"] == "stop" else (st["next"] or len(st["plan"]))
        for s in self.trucks[u]["plan"][start:]:
            if s["k"] != "P" or len(moves) >= 3:
                continue
            pid = self._pid_of(u, s)
            if pid is None:
                continue
            ok = [o for o in self.options(pid, T)["ok"] if o["u"] != u]
            if ok:
                o = ok[0]
                moves.append({"pid": pid, "a": short(s.get("a")), "w": s.get("w"), "u": o["u"], "veh": self.trucks[o["u"]]["veh"], "arr": o["arr"], "km": o["km"], "now": s["arr"]})
        self.delays[u].remove(d); self.rebuild(u)
        return {"u": u, "T": T, "min": minutes, "why": why, **res, "moves": moves}

    def apply_delay(self, u, T, minutes, why="Traffic"):
        self.delays.setdefault(u, []).append({"t": T, "min": float(minutes), "why": why})
        self.rebuild(u)

    def notready_options(self, u, T, minutes):
        """Freight not ready at a pickup (late shipment): wait for it, or leave and give the pickup a truck later."""
        st, j = self._focus(u, T, "P")
        if j is None:
            return {"err": "No pickup ahead on this truck"}
        s = st["plan"][j]; pid = self._pid_of(u, s)
        d = {"t": max(T, s["arr"]), "min": float(minutes), "why": "Waiting for freight"}
        wait = self._try(u, T, lambda: self.delays.setdefault(u, []).append(d), lambda: self.delays[u].remove(d))
        pk = self.pickups[pid] if pid is not None else None
        cutoff = self.pickup_by(pk) if pk else C.CLOSE
        return {"u": u, "T": T, "pid": pid, "a": short(s.get("a")), "w": s.get("w"), "sp": s.get("sp"), "min": minutes,
                "wait": wait, "ready_at": T + minutes, "cutoff": cutoff, "can_leave": pid is not None, "late_for_cutoff": T + minutes > cutoff}

    def apply_notready(self, u, T, minutes, choice):
        st, j = self._focus(u, T, "P")
        if j is None:
            return None
        s = st["plan"][j]; pid = self._pid_of(u, s)
        if choice == "wait":
            self.apply_delay(u, max(T, s["arr"]), minutes, "Waiting for freight")
            return {"pid": pid, "choice": "wait"}
        pk = self.pickups[pid]
        pk["ready"] = T + float(minutes)
        self.moved[pid] = {"u": -2, "at": T, "arr": None, "dep": None, "km": 0, "delay": 0, "before_k0": 10 ** 9, "d": None}
        self.rebuild(u)
        du = (pk.get("drop") or {}).get("u")
        if du is not None and du != u:
            self.rebuild(du)
        return {"pid": pid, "choice": "leave", "ready": pk["ready"]}

    def failed_options(self, u, T):
        """Couldn't deliver (closed, refused, no one there): bring it back to the depot, or try again later today."""
        st, j = self._focus(u, T, "D", just_done=True)
        if j is None:
            return {"err": "No delivery to report on this truck"}
        s = st["plan"][j]; key = (u, s["k0"], s.get("pid"))
        on_w = st["on"]["w"] + (s.get("w") or 0); on_sp = st["on"]["sp"] + (s.get("sp") or 0)
        r = {"key": key, "t": T}

        def do():
            self.failed.add(key); self.retries.setdefault(u, []).append(r)

        def undo():
            self.failed.discard(key); self.retries[u].remove(r)
        retry = self._try(u, T, do, undo)
        do(); self.rebuild(u)
        rs = next((x for x in self.trucks[u]["plan"] if x.get("retry") and (u, s["k0"], s.get("pid")) == key), None)
        undo(); self.rebuild(u)
        r_arr = rs["arr"] if rs else None
        r_ok = rs is not None and r_arr <= (s["appt"] + C.APPT_GRACE if s.get("appt") is not None else C.CLOSE) and not retry["broken"] and retry["duty_ok"]
        cls = self.trucks[u]["cls"]
        return {"u": u, "T": T, "a": short(s.get("a")), "c": s.get("c"), "w": s.get("w"), "sp": s.get("sp"), "appt": s.get("appt"), "key": list(key),
                "back": {"on_w": on_w, "on_sp": on_sp, "free_w": cls["cap"] - on_w, "free_sp": cls["spots"] * C.FILL_MAX - on_sp},
                "retry": {"arr": r_arr, "ok": r_ok, "broken": retry["broken"], "duty_ok": retry["duty_ok"],
                          "why": None if r_ok else ("would make other stops late" if retry["broken"] else "driver would pass 14 h" if not retry["duty_ok"] else "receiver closed by then")}}

    def apply_failed(self, u, T, choice, key=None):
        if key is None:
            st, j = self._focus(u, T, "D", just_done=True)
            if j is None:
                return None
            s = st["plan"][j]; key = (u, s["k0"], s.get("pid"))
        key = tuple(key)
        self.failed.add(key)
        if choice == "retry":
            self.retries.setdefault(u, []).append({"key": key, "t": T})
        self.rebuild(u)
        return {"key": list(key), "choice": choice}

    def cancel(self, pid):
        """Order cancelled in Elite: off its truck (and its same-day delivery), room freed."""
        pk = self.pickups[pid]
        owner = self.owner(pid)
        self.cancelled.add(pid)
        for u in {owner, pk.get("real_truck"), (pk.get("drop") or {}).get("u")}:
            if u is not None and u >= 0:
                self.rebuild(u)
        return owner

    # ---------- driver's report ----------
    def tap_space(self, u, T, free):
        st = self.state(u, T)
        raw_sp = st["on"]["sp"] - ((st["tap"]["calc"] - st["tap"]["free"]) if st["tap"] else 0)
        calc = self.trucks[u]["cls"]["spots"] * C.FILL_MAX - raw_sp
        rt = st["plan"][st["k"]]["rt"] if st["k"] >= 0 else None
        self.space[u] = {"t": T, "free": free, "calc": calc, "rt": rt}
        return {"calc": calc, "free": free, "flag": abs(calc - free) > 2}

    # ---------- the whole day vs reality ----------
    def compare(self, mode="ready"):
        sim = Replay(self.data, self.wait_per_min); sim.rank_mode = self.rank_mode
        todo = [p for p in sim.pickups if p.get("given") is not None and p["given"] >= C.DAY_START]
        when = lambda p: max(sim.known(p), p["ready"] if p.get("ready") is not None else C.DAY_START) if mode == "ready" else p["given"]
        rows = []
        for p in sorted(todo, key=when):
            t = when(p); real = sim.real_outcome(p["id"])
            if not real or real.get("arr") is None:      # no real pickup time recorded: nothing to compare against
                rows.append({"pid": p["id"], "t": t, "kept": True, "real": real, "no_real": True}); continue
            ok = sim.options(p["id"], t)["ok"]
            if not ok:
                rows.append({"pid": p["id"], "t": t, "kept": True, "real": real}); continue
            o = ok[0]; sim.assign(p["id"], o, t)
            rows.append({"pid": p["id"], "t": t, "u": o["u"], "our_arr": o["arr"], "our_km": o["km"], "our_d": (o.get("d") or {}).get("arr"),
                         "reasons": o.get("reasons", []), "n_ok": len(ok),
                         "real_arr": real["arr"], "real_km": real["km"], "real": real, "same": o["u"] == real["u"]})
        dec = [r for r in rows if not r.get("kept")]
        diff = sorted(r["real_arr"] - r["our_arr"] for r in dec)
        return {"mode": mode, "n": len(rows), "decided": len(dec), "kept": sum(1 for r in rows if r.get("kept") and not r.get("no_real")), "no_real": sum(1 for r in rows if r.get("no_real")),
                "same_truck": sum(r["same"] for r in dec), "earlier": sum(d > 15 for d in diff), "later": sum(d < -15 for d in diff),
                "median_earlier_min": diff[len(diff) // 2] if diff else 0, "hours_earlier": sum(d for d in diff if d > 0) / 60,
                "our_km": sum(r["our_km"] for r in dec), "real_km": sum(r["real_km"] for r in dec), "wait_per_min": self.wait_per_min, "rank_mode": self.rank_mode,
                "rows": rows, "trucks": [t["veh"] for t in sim.trucks]}
