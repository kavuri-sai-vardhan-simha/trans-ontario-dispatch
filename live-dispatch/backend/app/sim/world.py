"""The live world: replay clock + decision engine + our store + Elite/Samsara stand-ins.

Clock: Sep 29 replayed from 06:00 to 21:00 at an adjustable speed (Samsara stand-in).
History: pickups the real dispatcher gave out by phone happen at their real time,
unless our dispatcher has already assigned them. So the day stays real until we change it.
"""
from __future__ import annotations
import json, threading, time
from ..core import config as C
from ..core.integrations import EliteStub, SamsaraStub
from ..db.store import Store
from ..engine.replay import Replay, fmt_t, short, hav

T_MIN, T_MAX = 6 * 60, 21 * 60

GROUPS = [("deliver", "Can't deliver it the same day"), ("cutoff", "Misses the service cutoff"), ("room", "No room on board"), ("floor", "No floor space"), ("close", "Can't get there before closing"), ("late", "Would make other stops late"),
          ("14 h", "Driver hours limit"), ("70 h", "Driver 7-day hours limit"), ("tailgate", "Needs a tailgate"), ("tall", "Too tall for the truck"), ("53", "Needs a 53 ft trailer"), ("heavy", "Too heavy"), ("Broken", "Broken down"),
          ("Finished", "Finished for the day"), ("Not on the road", "Not on the road yet")]


def why_group(w):
    return next((g for k, g in GROUPS if k.lower() in w.lower()), "Other")


_DEST = None                   # order number -> final consignee (data/processed/dest.json)

class World:
    def __init__(self):
        self.lock = threading.RLock()
        self.day = C.DAY
        try:
            self.day = json.load(open(C.DB_FILE.with_name("clock.json"))).get("day") or C.DAY
        except Exception:
            pass
        if not self._day_file(self.day).exists():
            self.day = C.DAY
        C.DAY = self.day
        self.data = json.load(open(self._day_file(self.day), encoding="utf-8"))
        self.store = Store(C.DB_FILE)
        self.elite, self.samsara = EliteStub(), SamsaraStub()
        self.T, self.speed, self.playing = 11 * 60 + 20, 10.0, False
        self.clock_file = C.DB_FILE.with_name("clock.json")
        try:
            saved = json.load(open(self.clock_file))
            self.T, self.speed = float(saved["T"]), float(saved["speed"])
        except Exception:
            pass
        self._saved_at = 0.0
        self.events: list[dict] = []
        self.ev_id = 0
        self.offers: dict[int, dict] = {}        # truck -> pending job shown in the driver app
        self.problems: dict[int, dict] = {}      # truck -> problem the driver reported
        self.confirmed: dict[int, dict] = {}     # pickup -> confirmed on a truck (driver OK, or kept by the dispatcher)
        self.driver_seen: dict[int, float] = {}  # truck -> last time a driver app checked in (real seconds)
        self._load()

    # ---------- setup / restore ----------
    def _load(self):
        self.R = Replay(self.data)
        self.bookings = {}                       # pid -> booking
        self.contacts = {}                       # phone/email -> customer account (learned from orders entered at the desk)
        self.past = {c["id"]: c["past"] for c in self.data.get("customers", [])}
        for b in self.store.all("bookings"):
            self._add_booking_pickup(b["body"], replay=True)
        for d in self.store.all("decisions"):
            o = d["body"]
            if o.get("kind") == "breakdown":
                self.R.down[o["u"]] = {"t": o["t"], "lat": o["lat"], "lng": o["lng"], "why": o.get("why")}
            elif o.get("kind") == "spare":
                self.R.apply_spare(o["u"], o["t"], o["spare"])
            elif o.get("kind") == "unassign":
                self.R.moved.pop(o["pid"], None); self.R.rebuild(o["owner"]); self.R.rebuild(self.R.pickups[o["pid"]]["real_truck"])
            elif o.get("kind") == "delay":
                self.R.apply_delay(o["u"], o["t"], o["min"], o.get("why", "Traffic"))
            elif o.get("kind") == "notready_leave":
                pk = self.R.pickups[o["pid"]]; pk["ready"] = o["ready"]
                self.R.moved[o["pid"]] = {"u": -2, "at": o["t"], "arr": None, "dep": None, "km": 0, "delay": 0, "before_k0": 10 ** 9, "d": None}
                self.R.rebuild(o["u"])
            elif o.get("kind") == "failed":
                self.R.apply_failed(o["u"], o["t"], o["choice"], o["key"])
            elif o.get("kind") == "cancel":
                self.R.cancel(o["pid"])
            else:
                self.R.assign(d["pid"], o, d["t"])
        for r in self.store.all("reports"):
            o = r["body"]
            if r["kind"] == "space":
                self.R.space[r["u"]] = o
            elif r["kind"] == "gps_gap":
                self.R.gps[r["u"]] = o
        for e in self.store.all("events"):
            self.ev_id = max(self.ev_id, e["id"])
            self.events.append({"id": e["id"], "T": e["t"], "kind": e["kind"], **e["body"]})

    # ---------- which real day is replayed ----------
    @staticmethod
    def _day_file(day):
        f = C.DAYS_DIR / f"{day}.json"
        return f if f.exists() else C.DATA_FILE

    @staticmethod
    def days():
        out = []
        for f in sorted(C.DAYS_DIR.glob("*.json")) if C.DAYS_DIR.exists() else []:
            try:
                d = json.load(open(f, encoding="utf-8"))
            except Exception:
                continue
            if len(d.get("trucks", [])) < 5:
                continue
            out.append({"day": f.stem, "trucks": len(d["trucks"]), "pickups": len(d["pickups"])})
        return out or [{"day": C.DAY, "trucks": None, "pickups": None}]

    def set_day(self, day):
        with self.lock:
            if not (C.DAYS_DIR / f"{day}.json").exists():
                return {"ok": False, "why": "No data for that day"}
            self.day = C.DAY = day
            self.data = json.load(open(self._day_file(day), encoding="utf-8"))
            self.store.clear(); self.events.clear(); self.offers.clear(); self.problems.clear(); self.confirmed.clear()
            self.elite = EliteStub()
            self.T, self.playing = 11 * 60 + 20, False
            self.save_clock()
            self._load()
            self.event("system", f"Now replaying the real day {day}")
            return {"ok": True, "day": day}

    def reset(self):
        with self.lock:
            self.store.clear(); self.events.clear(); self.offers.clear(); self.problems.clear(); self.confirmed.clear()
            self.elite = EliteStub()
            self.T, self.playing = 11 * 60 + 20, False
            self.save_clock()
            self._load()
            self.event("system", "Prototype reset to the real Sep 29 day")

    def event(self, kind, text, **extra):
        body = {"text": text, **extra}
        eid = self.store.add("events", t=self.T, kind=kind, body=body)
        self.events.append({"id": eid, "T": self.T, "kind": kind, **body})
        self.events = self.events[-400:]

    # ---------- clock ----------
    def tick(self, dt_real):
        with self.lock:
            if self.playing:
                self.T = min(T_MAX, self.T + dt_real * self.speed / 60)
                if self.T >= T_MAX:
                    self.playing = False
            self._chase_answers()
            if time.time() - self._saved_at > 5:
                self.save_clock()

    ACK_REMIND, ACK_CALL = 5, 10      # minutes without "OK, got it": automatic reminder, then the dispatcher calls

    def _chase_answers(self):
        for u, off in self.offers.items():
            if off.get("state") != "new":
                continue
            age = self.T - off["T"]
            t = self.R.trucks[u]; a = short(self.R.pickups[off["pid"]]["a"])
            if age >= self.ACK_REMIND and not off.get("reminded"):
                off["reminded"] = self.T
                self.event("sync", f"Samsara: reminder sent to {t['veh']} driver (push notification + automated call): new pickup at {a}", u=u, pid=off["pid"])
            if age >= self.ACK_CALL and not off.get("escalated"):
                off["escalated"] = self.T
                self.event("alert", f"{t['veh']} driver hasn't confirmed the new pickup at {a} for {self.ACK_CALL} min. Call the driver.", u=u, pid=off["pid"])

    def confirm_by_phone(self, u):
        with self.lock:
            off = self.offers.get(u)
            if not off or off.get("state") != "new":
                return {"ok": False, "why": "Nothing waiting for an answer"}
            off["state"] = "seen"; off["by_phone"] = True
            self.confirmed[off["pid"]] = {"u": u, "how": "confirmed by phone", "T": self.T}
            self.event("driver", f"Dispatcher called {self.R.trucks[u]['veh']}: driver confirmed the pickup at {short(self.R.pickups[off['pid']]['a'])}", u=u, pid=off["pid"])
            return {"ok": True}

    def save_clock(self):
        self._saved_at = time.time()
        try:
            json.dump({"T": self.T, "speed": self.speed, "day": self.day}, open(self.clock_file, "w"))
        except OSError:
            pass

    def set_clock(self, action, value=None):
        with self.lock:
            if action == "play":
                self.playing = True
            elif action == "pause":
                self.playing = False
            elif action == "speed":
                self.speed = max(1, min(600, float(value)))
            elif action == "jump":
                self.T = max(T_MIN, min(T_MAX, float(value)))
                self._chase_answers()          # reminders / call alerts also fire when the clock is moved by hand
            self.save_clock()
            return self.clock()

    def clock(self):
        return {"T": self.T, "label": fmt_t(self.T), "speed": self.speed, "playing": self.playing, "day": self.day, "min": T_MIN, "max": T_MAX}

    # ---------- bookings (Web Dispatch portal / CSR) → Elite order ----------
    @staticmethod
    def contact_key(v):
        v = (v or "").strip().lower()
        if "@" in v:
            return v
        d = "".join(ch for ch in v if ch.isdigit())
        return d[-10:] if len(d) >= 7 else None

    def lookup(self, contact=None, account=None):
        """Who is this caller? By phone/email (remembered from earlier orders), or by Elite account. Nobody is asked."""
        cust, how = None, None
        if account and account.strip() in self.past:
            cust, how = account.strip(), "Elite account"
        k = self.contact_key(contact)
        if not cust and k and k in self.contacts:
            cust, how = self.contacts[k], "phone/email seen before"
        past = self.past.get(cust, 0) if cust else 0
        return {"found": bool(cust), "cust_id": cust, "past": past, "tier": C.tier(past), "how": how}

    def _add_booking_pickup(self, b, replay=False):
        sv = C.service(b.get("service"))
        k = self.contact_key(b.get("contact"))
        cust = b.get("cust_id")
        if k:
            self.contacts.setdefault(k, cust)
        drop = None
        if sv["same_day"]:     # Rush / Same day: the same truck delivers it today
            drop = {"o": b["ordno"] + "D", "a": b["consignee"]["address"], "c": b["consignee"]["name"], "lat": b["consignee"]["lat"],
                    "lng": b["consignee"]["lng"], "appt": b.get("deliver_appt"), "arr": None, "u": None}
        sp, sp_how = self.spots_for(b)
        pk = self.R.add_pickup({"svc": b.get("service"), "drop": drop, "tdg": bool(b.get("tdg")), "tg": bool(b.get("tailgate")),
            "h_in": float(b["height"]) if b.get("height") else None, "stack": bool(b.get("stackable")), "sp_how": sp_how, "cust": b.get("cust_id") or "", "past": int(b.get("past") or 0),
            "o": b["ordno"] + "P", "ordno": b["ordno"], "c": b["shipper"]["name"], "a": b["shipper"]["address"], "city": b["shipper"].get("city", ""),
            "lat": b["shipper"]["lat"], "lng": b["shipper"]["lng"], "w": b["weight"], "we": False, "sp": sp, "se": False,
            "eq": b.get("equipment", ""), "entered": b["entered"], "ready": b["ready"], "close": b.get("close"),
            "src": "booking", "channel": b["channel"], "aud": bool(b.get("audience"))})
        self.bookings[pk["id"]] = b
        self.past[cust] = self.past.get(cust, 0) + 1      # this order counts for the customer's next one
        return pk

    @staticmethod
    def spots_for(b):
        """Skid spots from the size when given: footprint per piece in 48 x 40 in spots, two high if stackable (not dangerous goods)."""
        import math
        L, Wd, H, n = b.get("length"), b.get("width"), b.get("height"), int(b.get("pieces") or 1)
        if not (L and Wd):
            return float(b["spots"]), "entered"
        per = math.ceil(L * Wd / (C.SKID_IN[0] * C.SKID_IN[1]) * 4) / 4
        total = per * n
        two_high = bool(b.get("stackable")) and not b.get("tdg") and H and H <= C.STACK_MAX_H
        if two_high:
            total = math.ceil(total / 2 * 4) / 4
        return max(0.25, total), ("from size, stacked two high" if two_high else "from size, not stacked")

    def booking_window(self):
        """Which services can still be entered right now (Trans Ontario's published cutoffs)."""
        T = self.T; out = {}
        for code in ("RUSH", "SAME DAY", "OVERNIGHT", "OUT OF TOWN", "AFTER HOURS"):
            sv = C.service(code)
            why = None
            if code == "AFTER HOURS":
                if T < C.AFTER_HOURS_FROM:
                    why = "After hours starts at 16:00"
            elif T >= C.AFTER_HOURS_FROM:
                why = "After 16:00, enter it as After hours (called in)"
            elif sv.get("order_by") is not None and T > sv["order_by"]:
                why = f"Order by {fmt_t(sv['order_by'])} for {sv['label'].lower()}"
            elif T > sv["pickup_by"] - 30:
                why = f"Pickup must happen before {fmt_t(sv['pickup_by'])}"
            out[code] = {"label": sv["label"], "pickup_by": sv["pickup_by"], "order_by": sv.get("order_by"), "same_day": sv["same_day"], "open": why is None, "why": why}
        return out

    AUDIENCE_PER_PHONE, AUDIENCE_MAX = 3, 60

    def desk_orders(self):
        """Orders entered live (Elite desk or audience phones) as soon as the dispatcher assigns them: Plan the day
        puts them on the same truck. The driver's answer is shown, but assigning is final."""
        out = []
        for pid, b in self.bookings.items():
            m = self.R.moved.get(pid)
            if not m or m["u"] < 0 or pid in self.R.cancelled:
                continue
            u = m["u"]; off = self.offers.get(u) or {}
            c = self.confirmed.get(pid)
            if c and c["u"] == u:
                how = c["how"]
            elif off.get("pid") == pid:
                how = {"new": "waiting for the driver's OK", "decline_requested": "driver asked to decline"}.get(off.get("state"), "assigned")
            else:
                how = "assigned"
            out.append({"pid": pid, "ordno": b["ordno"], "day": self.day, "name": b["shipper"]["name"], "cust_id": b.get("cust_id"),
                        "tier": C.tier(int(b.get("past") or 0)), "past": int(b.get("past") or 0), "audience": bool(b.get("audience")),
                        "channel": b.get("channel"), "service": b.get("service"), "entered": b["entered"], "ready": b["ready"],
                        "from": {k: b["shipper"].get(k) for k in ("address", "city", "lat", "lng")},
                        "to": {k: b["consignee"].get(k) for k in ("name", "address", "city", "lat", "lng")},
                        "w": b["weight"], "sp": self.R.pickups[pid]["sp"], "equipment": b.get("equipment"),
                        "truck": self.R.trucks[u]["veh"], "how": how, "assigned_at": m["at"], "confirmed_at": m["at"]})
        return sorted(out, key=lambda x: x["assigned_at"])

    def audience_count(self):
        return sum(1 for b in self.bookings.values() if b.get("audience"))

    def book(self, req: dict, client=None):
        with self.lock:
            b = dict(req)
            if b.get("audience"):            # live demo: people in the room booking from their phones
                mine = sum(1 for x in self.bookings.values() if x.get("audience") and x.get("client") == client)
                if mine >= self.AUDIENCE_PER_PHONE:
                    return {"ok": False, "why": f"Thanks! {self.AUDIENCE_PER_PHONE} orders per phone in this demo."}
                if self.audience_count() >= self.AUDIENCE_MAX:
                    return {"ok": False, "why": "The demo is full. Thanks for trying!"}
                b["client"] = client
            win = self.booking_window().get((b.get("service") or "").upper())
            if not win:
                return {"ok": False, "why": "Unknown service"}
            if not win["open"]:
                return {"ok": False, "why": win["why"]}
            b["entered"] = self.T
            b["ready"] = max(self.T, float(b.get("ready") or self.T))
            who = self.lookup(b.get("contact"), b.get("account"))
            b["cust_id"] = who["cust_id"] or ("NEW-" + str(abs(hash(self.contact_key(b.get("contact")) or b["shipper"]["name"])) % 10 ** 6).zfill(6))
            b["past"] = who["past"]
            order = self.elite.create_order(b)
            b["ordno"] = order["ordno"]
            self.store.add("bookings", ordno=b["ordno"], body=b, t=self.T)
            pk = self._add_booking_pickup(b)
            self.event("order", ("📱 From the audience: " if b.get("audience") else "") + order["msg"] + f" · {win['label']}", pid=pk["id"], audience=bool(b.get("audience")))
            return {"ok": True, "pid": pk["id"], "ordno": b["ordno"]}

    # ---------- dispatcher decisions ----------
    def assign(self, pid, u):
        with self.lock:
            opts = self.R.options(pid, self.T)
            o = next((x for x in opts["ok"] if x["u"] == u), None)
            if not o:
                why = next((x["why"] for x in opts["no"] if x["u"] == u), "not possible")
                return {"ok": False, "why": why}
            prev = self.R.owner(pid)
            self.R.assign(pid, o, self.T)
            keep = {k: o[k] for k in ("u", "arr", "dep", "km", "delay", "before_k0")}
            self.store.add("decisions", pid=pid, body=keep, t=self.T)
            pk, t = self.R.pickups[pid], self.R.trucks[u]
            ordno = pk.get("ordno") or pk["o"].split(",")[0][:-1]
            rank = opts["ok"].index(o) + 1
            self.event("assign", f"Dispatcher assigned {short(pk['a'])} to {t['veh']} (option {rank} of {len(opts['ok'])}), pickup {fmt_t(o['arr'])}", pid=pid, u=u)
            self.event("sync", self.elite.assign_pickup(ordno, t), pid=pid)
            self.event("sync", self.samsara.insert_stop(t, short(pk["a"]), fmt_t(o["arr"])), pid=pid, u=u)
            if prev is not None and prev != u and prev >= 0 and pk.get("real_truck") == prev:
                self.event("sync", self.samsara.remove_stop(self.R.trucks[prev], short(pk["a"])), pid=pid, u=prev)
            self.offers[u] = {"pid": pid, "T": self.T, "state": "new"}
            return {"ok": True}

    def unassign(self, pid):
        with self.lock:
            m = self.R.moved.get(pid)
            if not m or m["u"] < 0:
                return {"ok": False}
            owner = m["u"]
            self.R.moved.pop(pid); self.R.rebuild(owner); self.R.rebuild(self.R.pickups[pid]["real_truck"])
            self.store.add("decisions", pid=pid, body={"kind": "unassign", "pid": pid, "owner": owner}, t=self.T)
            pk = self.R.pickups[pid]
            self.event("assign", f"Dispatcher took {short(pk['a'])} off {self.R.trucks[owner]['veh']}", pid=pid)
            self.event("sync", self.elite.unassign_pickup(pk.get("ordno") or pk["o"][:-1]), pid=pid)
            return {"ok": True}

    def breakdown_preview(self, u):
        with self.lock:
            return self.R.breakdown(u, self.T)

    def breakdown_apply(self, u, why=None, allow_before=False, partner=False):
        with self.lock:
            b = self.R.breakdown(u, self.T, allow_before=allow_before)
            if b.get("err"):
                return b
            self.R.apply_breakdown(b, why=why)
            self.problems.pop(u, None)
            self.store.add("decisions", pid=-1, body={"kind": "breakdown", "u": u, "t": self.T, "why": why, **b["site"]}, t=self.T)
            for m in b["moves"]:
                if m["o"]:
                    keep = {k: m["o"][k] for k in ("u", "arr", "dep", "km", "delay", "before_k0")}
                    self.store.add("decisions", pid=m["pid"], body=keep, t=self.T)
            t = self.R.trucks[u]
            self.event("alert", f"{t['veh']} stopped ({why.lower() if why else 'broken down'}) at {fmt_t(self.T)}; {len([m for m in b['moves'] if m['o']])} pickups moved to other trucks", u=u)
            if partner:
                self.event("sync", f"Partner carrier asked to take {t['veh']}'s {b['dels']} deliveries (rates not in the data)", u=u)
            elif b["rescue"]:
                r = b["rescue"][0]
                self.event("alert", f"Rescue: {self.R.trucks[r['u']]['veh']} meets it at {fmt_t(r['meet'])} for {b['dels']} deliveries ({r['late']} late)", u=r["u"])
            return {"ok": True, "moved": len(b["moves"])}

    # ---------- driver called in sick ----------
    def sick_preview(self, u):
        with self.lock:
            return self.R.sick(u, self.T)

    def sick_apply(self, u, choice):
        with self.lock:
            o = self.R.sick(u, self.T)
            if o.get("err"):
                return o
            t = self.R.trucks[u]
            if choice == "spare":
                sp = o.get("spare")
                if not sp:
                    return {"err": "No spare driver with the right licence today"}
                self.R.apply_spare(u, self.T, sp)
                self.store.add("decisions", pid=-1, body={"kind": "spare", "u": u, "t": self.T, "spare": sp}, t=self.T)
                self.problems.pop(u, None)
                self.event("alert", f"{t['veh']}: spare driver {sp['code']} {sp['name']} takes over at {fmt_t(sp['until'])}; route unchanged, {sp['late']} stop(s) would be late", u=u)
                self.event("sync", f"Elite: {t['veh']} driver changed to {sp['code']} ({sp['name']}); Samsara: route moved to the spare's driver app", u=u)
                return {"ok": True}
            if choice in ("share", "partner"):
                return self.breakdown_apply(u, why="Driver off sick", allow_before=True, partner=(choice == "partner"))
            return {"err": "Unknown choice"}

    def report_problem(self, u, kind, minutes=None):
        with self.lock:
            t = self.R.trucks[u]
            minutes = float(minutes or {"late": 30, "notready": 30}.get(kind, 0))
            self.problems[u] = {"kind": kind, "T": self.T, "min": minutes}
            txt = {"sick": "is unwell and can't continue", "truck": "has a truck problem and can't drive",
                   "late": f"is stuck in traffic (about {minutes:.0f} min late)", "notready": f"says the freight isn't ready (about {minutes:.0f} min)",
                   "failed": "couldn't deliver (closed, refused or no one there)"}.get(kind, "reported a problem")
            self.event("alert", f"{t['veh']}: driver {txt}", u=u, problem=kind)
            return {"ok": True}

    # ---------- the dispatcher's choices for a driver's problem ----------
    def problem_options(self, u):
        with self.lock:
            p = self.problems.get(u)
            if not p:
                return {"err": "No problem reported"}
            k = p["kind"]
            if k == "late":
                return {"kind": k, **self.R.delay_options(u, self.T, p["min"])}
            if k == "notready":
                return {"kind": k, **self.R.notready_options(u, self.T, p["min"])}
            if k == "failed":
                return {"kind": k, **self.R.failed_options(u, self.T)}
            return {"kind": k}

    def problem_apply(self, u, choice, minutes=None):
        with self.lock:
            p = self.problems.get(u)
            if not p:
                return {"err": "No problem reported"}
            t = self.R.trucks[u]; k = p["kind"]; T = self.T
            m = float(minutes or p["min"] or 0)
            if k == "late":
                self.R.apply_delay(u, T, m, "Traffic")
                self.store.add("decisions", pid=-1, body={"kind": "delay", "u": u, "t": T, "min": m, "why": "Traffic"}, t=T)
                self.event("alert", f"{t['veh']}: route shifted {m:.0f} min for traffic; ETAs updated", u=u)
                self.event("sync", f"Samsara: {t['veh']} ETAs +{m:.0f} min", u=u)
            elif k == "notready":
                r = self.R.apply_notready(u, T, m, choice)
                if not r:
                    return {"err": "No pickup ahead"}
                pk = self.R.pickups[r["pid"]] if r["pid"] is not None else None
                if choice == "wait":
                    self.store.add("decisions", pid=-1, body={"kind": "delay", "u": u, "t": max(T, T), "min": m, "why": "Waiting for freight"}, t=T)
                    self.event("alert", f"{t['veh']} waits {m:.0f} min for the freight at {short(pk['a']) if pk else 'the pickup'}", u=u)
                else:
                    self.store.add("decisions", pid=r["pid"], body={"kind": "notready_leave", "u": u, "pid": r["pid"], "t": T, "ready": r["ready"]}, t=T)
                    self.event("alert", f"{t['veh']} leaves {short(pk['a'])} (freight ready about {fmt_t(r['ready'])}); back in the waiting list for a truck", u=u, pid=r["pid"])
                    self.event("sync", self.samsara.remove_stop(t, short(pk["a"])), u=u, pid=r["pid"])
                    self.event("sync", f"Elite: order {pk.get('ordno') or pk['o'].split(',')[0][:-1]} ready time → {fmt_t(r['ready'])}", pid=r["pid"])
            elif k == "failed":
                r = self.R.apply_failed(u, T, choice)
                if not r:
                    return {"err": "No delivery to report"}
                self.store.add("decisions", pid=-1, body={"kind": "failed", "u": u, "t": T, "choice": choice, "key": r["key"]}, t=T)
                self.event("alert", f"{t['veh']}: failed delivery " + ("re-attempted later today" if choice == "retry" else "stays on board, back to the depot, re-delivered next business day"), u=u)
                self.event("sync", "Elite: delivery leg marked failed (" + ("re-attempt today" if choice == "retry" else "re-deliver next business day") + ")", u=u)
            else:
                return {"err": "Use the sick / breakdown options for this problem"}
            self.problems.pop(u, None)
            return {"ok": True}

    def cancel_order(self, pid):
        with self.lock:
            pk = self.R.pickups[pid]
            if pid in self.R.cancelled:
                return {"ok": False, "why": "Already cancelled"}
            if self.R.status(pk, self.T) == "picked":
                return {"ok": False, "why": "Already picked up"}
            owner = self.R.cancel(pid)
            self.confirmed.pop(pid, None)
            self.store.add("decisions", pid=pid, body={"kind": "cancel", "pid": pid}, t=self.T)
            ordno = pk.get("ordno") or pk["o"].split(",")[0][:-1]
            self.event("order", f"Order {ordno} cancelled in Elite ({short(pk['a'])})" + (f"; removed from {self.R.trucks[owner]['veh']}, room freed" if owner is not None and owner >= 0 else ""), pid=pid)
            if owner is not None and owner >= 0:
                self.event("sync", self.samsara.remove_stop(self.R.trucks[owner], short(pk["a"])), pid=pid, u=owner)
                off = self.offers.get(owner)
                if off and off["pid"] == pid:
                    off["state"] = "cancelled"
            return {"ok": True}

    # ---------- driver reports (optional; through the Samsara driver app) ----------
    def report_space(self, u, free):
        with self.lock:
            r = self.R.tap_space(u, self.T, float(free))
            self.store.add("reports", u=u, kind="space", body=self.R.space[u], t=self.T)
            t = self.R.trucks[u]
            self.event("driver", f"{t['veh']} driver: {free:g} floor spots free (we estimated {r['calc']:.1f})", u=u)
            return r

    def gps_gap(self, u, minutes):
        with self.lock:
            self.R.gps[u] = {"from": self.T, "to": self.T + minutes}
            self.store.add("reports", u=u, kind="gps_gap", body=self.R.gps[u], t=self.T)
            self.event("driver", f"{self.R.trucks[u]['veh']}: Samsara silent, driver phone sharing position", u=u)

    # equipment is not a driver reason: the system checks it against the order in Elite (drivers don't know what they are picking up)
    DECLINE_REASONS = {"no_room": "No room on the truck", "too_late": "Can't get there in time",
                       "hours": "Close to my hours limit", "other": "Other"}

    def offer_reply(self, u, action, reason=None, note=""):
        """Driver side. The pickup is already on the route: the driver can only acknowledge it,
        or ask to decline with a reason. Only the dispatcher can take it off."""
        with self.lock:
            off = self.offers.get(u)
            if not off:
                return {"ok": False, "why": "No new pickup"}
            pk = self.R.pickups[off["pid"]]; t = self.R.trucks[u]
            if action == "ack":
                off["state"] = "seen"
                self.confirmed[off["pid"]] = {"u": u, "how": "driver OK", "T": self.T}
                self.event("driver", f"{t['veh']} driver saw the new pickup at {short(pk['a'])}", u=u, pid=off["pid"])
                return {"ok": True}
            if action == "decline":
                if reason not in self.DECLINE_REASONS:
                    return {"ok": False, "why": "Pick a reason"}
                why = self.DECLINE_REASONS[reason] + (f": {note.strip()[:120]}" if note and note.strip() else "")
                off.update(state="decline_requested", reason=why, asked=self.T)
                self.event("alert", f"{t['veh']} driver asks to decline {short(pk['a'])}: {why}. Approve or keep it on the truck.", u=u, pid=off["pid"], decline=True)
                return {"ok": True}
            return {"ok": False, "why": "Unknown action"}

    def decide_decline(self, u, decision, note=""):
        """Dispatcher side: approve the driver's decline (pickup goes back to waiting) or override it (stays on the truck)."""
        with self.lock:
            off = self.offers.get(u)
            if not off or off.get("state") != "decline_requested":
                return {"ok": False, "why": "No decline request"}
            pk = self.R.pickups[off["pid"]]; t = self.R.trucks[u]
            if decision == "approve":
                off["state"] = "decline_approved"
                self.confirmed.pop(off["pid"], None)
                self.unassign(off["pid"])
                self.event("driver", f"Dispatcher approved {t['veh']}'s decline of {short(pk['a'])}; it's back in the waiting list", u=u, pid=off["pid"])
            else:
                off["state"] = "kept"; off["note"] = (note or "").strip()[:160]
                self.confirmed[off["pid"]] = {"u": u, "how": "kept by the dispatcher", "T": self.T}
                self.event("driver", f"Dispatcher kept {short(pk['a'])} on {t['veh']}" + (f": {off['note']}" if off["note"] else ""), u=u, pid=off["pid"])
            return {"ok": True}

    # ---------- views ----------
    def truck_row(self, u, T=None):
        T = self.T if T is None else T
        t = self.R.trucks[u]; st = self.R.state(u, T)
        nxt = None
        start = st["k"] + 1 if st["status"] == "stop" else st["next"]
        if start is not None and start < len(st["plan"]):
            s = st["plan"][start]
            nxt = {"a": short(s.get("a")) if s["k"] in "PD" else "Depot", "k": s["k"], "arr": s["arr"]}
        left = sum(1 for s in st["plan"][max(0, st["k"] + 1):] if s["k"] in "PD")
        return {"u": u, "id": t["id"], "code": t["code"], "name": t["name"], "veh": t["veh"], "vc": t["vc"], "cls": t["cls"]["label"],
                "cap": t["cls"]["cap"], "spots": t["cls"]["spots"],
                "status": st["status"], "label": st["label"], "lat": st["pos"]["lat"], "lng": st["pos"]["lng"],
                "on_w": st["on"]["w"], "on_sp": st["on"]["sp"], "free_w": st["free"]["w"], "free_sp": st["free"]["sp"], "est": st["free"]["est"],
                "fill": st["fill"], "src": st["src"], "age": st["samsara_age"], "duty_used": st["duty_used"],
                "cycle_min": t.get("cycle_min", 0), "h_in": t["cls"].get("h_in"), "tailgate": t["cls"].get("tailgate"),
                "next": nxt, "left": left, "tap": st["tap"], "flags": t.get("f", []),
                "driver_app": (time.time() - self.driver_seen.get(u, 0)) < 20}

    def truck_detail(self, u):
        st = self.R.state(u, self.T)
        row = self.truck_row(u)
        plan = []
        for j, s in enumerate(st["plan"]):
            plan.append({"j": j, "svc": s.get("svc"), "k": s["k"], "a": short(s.get("a")) if s["k"] in "PD" else "Depot", "c": s.get("c"), "o": s.get("o"),
                         "lat": s["lat"], "lng": s["lng"], "arr": s["arr"], "dep": s["dep"], "w": s.get("w"), "sp": s.get("sp"),
                         "se": s.get("se"), "appt": s.get("appt"), "ins": bool(s.get("ins")), "pid": s.get("pid"),
                         "failed": bool(s.get("failed")), "retry": bool(s.get("retry")), "tdg": bool(s.get("tdg")), "straps": bool(s.get("straps")), "tg": bool(s.get("tg")),
                         "done": s["dep"] <= self.T, "load_w": st["loads"][j]["w"], "load_sp": st["loads"][j]["sp"]})
        row["plan"] = plan
        row["duty_start"], row["duty_end"] = st.get("duty_start"), st.get("duty_end")
        row["offer"] = self.offers.get(u)
        row["problem"] = self.problems.get(u)
        row["spares_left"] = len(self.R.spares())
        if row["offer"]:
            pk = self.R.pickups[row["offer"]["pid"]]
            row["offer"] = dict(row["offer"], a=short(pk["a"]), c=pk["c"], w=pk["w"], sp=pk["sp"], tier=C.tier(pk.get("past", 0)),
                                age=self.T - row["offer"]["T"], remind_at=self.ACK_REMIND, call_at=self.ACK_CALL)
        return row

    def _dest(self, pk, ordno):
        """Where the freight finally goes: the consignee in Elite (replayed orders) or the one entered with a booking."""
        b = self.bookings.get(pk["id"])
        if b and b.get("consignee"):
            c = b["consignee"]
            return {"name": c.get("name") or "", "a": c.get("address") or "", "city": c.get("city") or ""}
        global _DEST
        if _DEST is None:
            try:
                _DEST = json.load(open(C.DATA_FILE.with_name("dest.json")))
            except Exception:
                _DEST = {}
        return _DEST.get(str(ordno))

    def order_row(self, pk, status):
        R = self.R; T = self.T
        m = R.moved.get(pk["id"]); real = R.real_outcome(pk["id"])
        if m and m["u"] < 0:
            m = None          # taken off its truck (freight not ready): waiting again
        owner = m["u"] if m else (pk["real_truck"] if status in ("given", "picked") and pk.get("real_truck") is not None else None)
        ordno = pk.get("ordno") or pk["o"].split(",")[0][:-1]
        ready = pk.get("ready")
        sv = C.service(pk.get("svc"))
        d = pk.get("drop")
        mm = m or {}
        return {"svc": pk.get("svc") or "", "svc_label": sv["label"], "pickup_by": R.pickup_by(pk), "deliver_by": R.deliver_by(pk),
                "drop": ({"a": short(d["a"]), "c": d.get("c"), "lat": d["lat"], "lng": d["lng"], "planned": (mm.get("d") or {}).get("arr")} if d else None),
                "dest": self._dest(pk, ordno),
                "cust": pk.get("cust"), "past": pk.get("past", 0), "tier": C.tier(pk.get("past", 0)),
                "pid": pk["id"], "ordno": ordno, "orders": pk["o"], "src": pk.get("src"), "channel": pk.get("channel"), "audience": bool(pk.get("aud")),
                "c": pk["c"], "a": short(pk["a"]), "full_a": pk["a"], "city": pk.get("city"), "lat": pk["lat"], "lng": pk["lng"],
                "w": pk["w"], "we": pk["we"], "sp": pk["sp"], "se": pk["se"], "eq": pk.get("eq"),
                "tdg": bool(pk.get("tdg")), "tg": bool(pk.get("tg")), "h_in": pk.get("h_in"), "stack": pk.get("stack"), "sp_how": pk.get("sp_how"),
                "entered": pk.get("entered"), "known": R.known(pk), "ready": ready, "close": pk.get("close") or C.CLOSE,
                "status": status, "by": "us" if m else ("phone" if status in ("given", "picked") else None),
                "truck": R.trucks[owner]["veh"] if owner is not None else None, "u": owner,
                "pickup_at": m["arr"] if m else (pk["act"]["arr"] if status in ("given", "picked") and pk.get("act") else None),
                "waiting_min": (T - max(ready if ready is not None else 0, R.known(pk))) if status == "waiting" else None,
                "real": ({"truck": R.trucks[real["u"]]["veh"], "given": real["given"], "arr": real["arr"], "km": real["km"]} if real else None)}

    def orders(self):
        return [self.order_row(pk, s) for pk, s in self.R.feed(self.T)]

    def options(self, pid):
        t0 = time.perf_counter()
        o = self.R.options(pid, self.T)
        self.decide_ms = (getattr(self, "decide_ms", []) + [(time.perf_counter() - t0) * 1000])[-50:]
        tr = self.R.trucks
        out = {"order": self.order_row(o["pk"], self.R.status(o["pk"], self.T)), "T": self.T, "ok": [], "no": []}
        for x in o["ok"][:8]:
            t = tr[x["u"]]
            out["ok"].append({"u": x["u"], "veh": t["veh"], "name": t["name"], "code": t["code"], "cls": t["cls"]["label"], "arr": x["arr"],
                              "km": x["km"], "delay": x["delay"], "cost": x["cost"], "free_w": x["free_w"], "free_sp": x["free_sp"], "est": x["est"],
                              "reasons": x["reasons"], "from": x["prev"],
                              "conflicts": self.R.conflicts(pid, x, self.T) if len(out["ok"]) < 3 else []})
        out["n_ok"] = len(o["ok"])
        out["rank_mode"] = self.R.rank_mode
        groups = {}
        for x in o["no"]:
            groups.setdefault(why_group(x["why"]), []).append({"u": x["u"], "veh": tr[x["u"]]["veh"], "why": x["why"]})
        out["no"] = [{"reason": k, "trucks": v} for k, v in groups.items()]
        return out

    def snapshot(self):
        with self.lock:
            T = self.T
            trucks = []
            for t in self.R.trucks:
                st = self.R.state(t["i"], T)
                trucks.append([t["i"], round(st["pos"]["lat"], 5), round(st["pos"]["lng"], 5), st["status"], round(st["fill"], 2), st["src"]])
            feed = self.R.feed(T)
            return {"type": "tick", "clock": self.clock(), "trucks": trucks,
                    "counts": {"waiting": sum(1 for _, s in feed if s == "waiting"), "assigned": sum(1 for _, s in feed if s == "assigned"),
                               "on_road": sum(1 for x in trucks if x[3] in ("moving", "stop")), "down": sum(1 for x in trucks if x[3] == "down")},
                    "last_event": self.events[-1]["id"] if self.events else 0}

    def track(self, ordno):
        pid = next((p for p, b in self.bookings.items() if b["ordno"] == ordno), None)
        if pid is None:
            pk = next((p for p in self.R.pickups if ordno in p["o"]), None)
            if not pk:
                return None
            pid = pk["id"]
        pk = self.R.pickups[pid]; s = self.R.status(pk, self.T)
        row = self.order_row(pk, s)
        b = self.bookings.get(pid)
        res = {"order": row, "booking": b, "clock": self.clock(), "steps": []}
        sv = C.service(pk.get("svc"))
        m = self.R.moved.get(pid) or {}
        d_t = (m.get("d") or {}).get("dep") if m else ((pk.get("drop") or {}).get("arr") if s in ("given", "picked") else None)
        delivered = sv["same_day"] and d_t is not None and self.T >= d_t
        res["service"] = {"code": pk.get("svc"), "label": sv["label"], "pickup_by": self.R.pickup_by(pk), "deliver_by": self.R.deliver_by(pk), "same_day": sv["same_day"]}
        res["steps"] = [
            {"k": "received", "label": "Order received in Elite", "t": row["known"], "done": True},
            {"k": "assigned", "label": "Truck assigned", "t": None, "done": s in ("assigned", "given", "picked")},
            {"k": "picked", "label": "Picked up", "t": row["pickup_at"] if s == "picked" else None, "done": s == "picked"},
        ] + ([{"k": "delivered", "label": f"Delivered today (by {fmt_t(self.R.deliver_by(pk))})", "t": d_t if delivered else None, "done": delivered}] if sv["same_day"] else [
            {"k": "depot", "label": "At the Trans Ontario depot, Scarborough (overnight)", "t": None, "done": False},
            {"k": "delivery", "label": "Delivered next business day", "t": None, "done": False}])
        res["drop_eta"] = (m.get("d") or {}).get("arr")
        if row["u"] is not None:
            tr = self.truck_row(row["u"])
            st = self.R.state(row["u"], self.T)
            ahead = 0; eta = None
            start = st["k"] + 1 if st["status"] == "stop" else (st["next"] or 0)
            for s2 in st["plan"][start:]:
                if (s2.get("pid") == pid) or (s2.get("o") == pk["o"] and s2["k"] == "P"):
                    eta = s2["arr"]; break
                if s2["k"] in "PD":
                    ahead += 1
            res["truck"] = {"veh": tr["veh"], "lat": tr["lat"], "lng": tr["lng"], "status": tr["status"], "label": tr["label"],
                            "stops_before": ahead, "eta": eta, "km_away": hav(tr, pk) * C.CIRCUITY}
        return res
