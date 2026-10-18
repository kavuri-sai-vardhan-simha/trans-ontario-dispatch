"""Trans Ontario Live Dispatch — prototype backend.

Run:  python -m uvicorn app.main:app --port 8000      (from APP_2/backend)
Apps: http://localhost:8000/dispatch   http://localhost:8000/book   http://localhost:8000/driver
"""
from __future__ import annotations
import asyncio, json, re
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from .core import config as C
from .engine.replay import Replay, short
from .sim.world import World
from .core import share

app = FastAPI(title="Trans Ontario Live Dispatch (prototype)")
W = World()


# ---------------- clock (prototype control: replay speed) ----------------
class ClockReq(BaseModel):
    action: str
    value: float | None = None


@app.get("/api/clock")
def get_clock():
    return W.clock()


@app.post("/api/clock")
def post_clock(r: ClockReq):
    return W.set_clock(r.action, r.value)


@app.post("/api/reset")
def reset():
    W.reset(); return {"ok": True}


# ---------------- reference data ----------------
@app.get("/api/days")
def days():
    return {"day": W.day, "days": W.days()}


class DayReq(BaseModel):
    day: str


@app.post("/api/day")
def set_day(r: DayReq):
    res = W.set_day(r.day)
    if res.get("ok"):
        _CMP.clear()
    return res


@app.get("/api/desk-orders")
def desk_orders():
    """Live orders as soon as they are assigned: Plan the day adds each one to the same truck automatically."""
    with W.lock:
        return {"day": W.day, "orders": W.desk_orders()}


@app.get("/api/share")
def share_links():
    """Links for the audience QR (phone booking page)."""
    return {**share.links(), "audience": W.audience_count()}


@app.get("/api/meta")
def meta():
    return {"day": W.day, "depot": W.R.depot, "classes": C.CLASSES, "contact": C.CONTACT,
            "trucks": [{"u": t["i"], "veh": t["veh"], "code": t["code"], "name": t["name"], "vc": t["vc"]} for t in W.R.trucks],
            "rules": {"fill_max": C.FILL_MAX, "max_duty_h": C.MAX_DUTY / 60, "appt_grace": C.APPT_GRACE, "close": C.CLOSE, "wait_per_min": W.R.wait_per_min}}


@app.get("/api/customers")
def customers():
    """Elite billing customers seen in the report, with how many orders they placed on the earlier days (for the Elite desk)."""
    return {"days": W.data.get("past_days", []), "regular_min": C.REGULAR_MIN,
            "customers": [dict(c, tier=C.tier(c["past"])) for c in W.data.get("customers", [])]}


@app.get("/api/elite/feed")
def elite_feed(limit: int = 40):
    """Orders as they entered Elite up to the clock (real Sep 29 ones at their entry time, plus orders typed at the desk)."""
    with W.lock:
        rows = [W.order_row(pk, s) for pk, s in W.R.feed(W.T)]
        rows += [dict(W.order_row(pk, "cancelled"), status="cancelled") for pk in W.R.pickups if pk["id"] in W.R.cancelled and W.T >= W.R.known(pk)]
    rows.sort(key=lambda r: -(r["entered"] if r["entered"] is not None else 0))
    return rows[:limit]


@app.get("/api/places")
def places():
    """Known business addresses from the routing report (all 12 days), to pick from when booking (no outside geocoder)."""
    try:
        return json.load(open(C.DATA_FILE.with_name("places.json")))
    except OSError:
        pass
    seen, out = set(), []
    for t in W.data["trucks"]:
        for s in t["stops"]:
            if s["k"] not in "PD":
                continue
            key = re.sub(r"\s+", " ", s["a"]).upper()
            if key in seen:
                continue
            seen.add(key)
            out.append({"a": re.sub(r"\s+", " ", s["a"]).strip(), "city": s.get("city", ""), "c": s.get("c"), "lat": s["lat"], "lng": s["lng"]})
    return sorted(out, key=lambda p: p["a"])


# ---------------- live state ----------------
@app.get("/api/trucks")
def trucks():
    with W.lock:
        return [W.truck_row(t["i"]) for t in W.R.trucks]


@app.get("/api/trucks/{u}")
def truck(u: int):
    if not 0 <= u < len(W.R.trucks):
        raise HTTPException(404)
    with W.lock:
        return W.truck_detail(u)


@app.get("/api/orders")
def orders():
    with W.lock:
        return W.orders()


@app.get("/api/orders/{pid}/options")
def options(pid: int):
    if not 0 <= pid < len(W.R.pickups):
        raise HTTPException(404)
    with W.lock:
        return W.options(pid)


class AssignReq(BaseModel):
    u: int


@app.post("/api/orders/{pid}/assign")
def assign(pid: int, r: AssignReq):
    return W.assign(pid, r.u)


@app.post("/api/orders/{pid}/unassign")
def unassign(pid: int):
    return W.unassign(pid)


@app.get("/api/warnings")
def warnings():
    with W.lock:
        what = {"sick": "is unwell and can't continue", "truck": "has a truck problem", "late": "is stuck in traffic",
                "notready": "says the freight isn't ready", "failed": "couldn't deliver"}
        out = [{"lvl": "crit", "u": u, "txt": f"{W.R.trucks[u]['veh']}: driver {what.get(p['kind'], 'reported a problem')}. Open the truck to act."} for u, p in W.problems.items()]
        for u, off in W.offers.items():
            if off.get("state") == "new" and W.T - off["T"] >= W.ACK_CALL:
                out.insert(0, {"lvl": "crit", "u": u, "txt": f"{W.R.trucks[u]['veh']} driver hasn't confirmed the new pickup at {short(W.R.pickups[off['pid']]['a'])} ({W.T - off['T']:.0f} min). Call the driver."})
            if off.get("state") == "decline_requested":
                out.insert(0, {"lvl": "crit", "u": u, "txt": f"{W.R.trucks[u]['veh']} driver asks to decline {short(W.R.pickups[off['pid']]['a'])}: {off['reason']}. Open the truck to approve or keep it."})
        out += W.R.warnings(W.T)
        for w in out:
            if "u" in w:
                w["veh"] = W.R.trucks[w["u"]]["veh"]
        return out


@app.get("/api/gaps")
def gaps():
    with W.lock:
        g = W.R.gaps(W.T)
        for x in g:
            pk = W.R.pickups[x["pid"]]
            x.update(a=short(pk["a"]), veh=W.R.trucks[x["u"]]["veh"], w=pk["w"])
        return g


@app.get("/api/events")
def events(after: int = 0):
    with W.lock:
        return [e for e in W.events if e["id"] > after][-200:]


_CMP: dict = {}


def _compare(mode, wait):
    from .engine.replay import MODE
    key = (mode, round(wait, 2), W.R.rank_mode, MODE["onsite"])
    if key not in _CMP:
        R = Replay(W.data, wait); R.rank_mode = W.R.rank_mode
        _CMP[key] = R.compare(mode)
    return _CMP[key]


@app.get("/api/compare")
def compare(mode: str = "same", wait: float | None = None):
    c = _compare(mode, wait if wait is not None else W.R.wait_per_min)
    return {k: v for k, v in c.items() if k not in ("rows", "trucks")}


@app.get("/api/compare/rows")
def compare_rows(mode: str = "same", wait: float | None = None, upto: float | None = None):
    """Every real Sep 29 pickup: what the dispatcher did by phone vs what our system suggests at the same moment."""
    from .core import config as CC
    c = _compare(mode, wait if wait is not None else W.R.wait_per_min)
    veh = c["trucks"]; out = []
    for r in c["rows"]:
        if upto is not None and r["t"] > upto:
            continue
        pk = W.R.pickups[r["pid"]]; real = r.get("real") or {}
        ready = pk.get("ready")
        row = {"pid": r["pid"], "ordno": pk["o"].split(",")[0][:-1], "a": short(pk["a"]), "city": pk.get("city"), "c": pk["c"],
               "svc": CC.service(pk.get("svc"))["label"], "w": pk["w"], "sp": pk["sp"], "se": pk["se"],
               "entered": W.R.known(pk), "ready": ready, "decide": r["t"], "same_day": bool(pk.get("drop")),
               "manual": {"truck": veh[real["u"]] if real.get("u") is not None else None, "given": real.get("given"), "pickup": real.get("arr"),
                          "km": real.get("km"), "wait": (real["arr"] - max(ready or 0, W.R.known(pk))) if real.get("arr") is not None else None},
               "ours": None}
        if not r.get("kept"):
            row["ours"] = {"truck": veh[r["u"]], "pickup": r["our_arr"], "km": r["our_km"], "drop": r.get("our_d"), "reasons": r["reasons"], "n_ok": r["n_ok"],
                           "wait": r["our_arr"] - max(ready or 0, W.R.known(pk)), "same": r["same"]}
            row["gain_min"] = real["arr"] - r["our_arr"]
            row["km_saved"] = real["km"] - r["our_km"]
        out.append(row)
    dec = [x for x in out if x["ours"]]
    summ = {"n": len(out), "decided": len(dec), "earlier": sum(x["gain_min"] > 15 for x in dec), "later": sum(x["gain_min"] < -15 for x in dec),
            "same_truck": sum(x["ours"]["same"] for x in dec), "manual_km": sum(x["manual"]["km"] or 0 for x in dec), "our_km": sum(x["ours"]["km"] for x in dec),
            "manual_wait": sum(x["manual"]["wait"] or 0 for x in dec) / max(1, len(dec)), "our_wait": sum(x["ours"]["wait"] for x in dec) / max(1, len(dec))}
    return {"mode": mode, "upto": upto, "summary": summ, "rows": out}


class SettingsReq(BaseModel):
    wait_per_min: float | None = Field(default=None, ge=0, le=10)
    rank_mode: str | None = None          # "time" (default, no prices) or "cost" (illustrative $)
    onsite: str | None = None             # "standard" (12 min + 3 per skid) or "learned" (from real stops)


@app.get("/api/settings")
def get_settings():
    from .engine.replay import MODE
    return {"wait_per_min": W.R.wait_per_min, "rank_mode": W.R.rank_mode, "regular_min": C.REGULAR_MIN, "onsite": MODE["onsite"]}


@app.post("/api/settings")
def settings(r: SettingsReq):
    with W.lock:
        if r.wait_per_min is not None:
            W.R.wait_per_min = r.wait_per_min
        if r.rank_mode in ("time", "cost"):
            W.R.rank_mode = r.rank_mode
        if r.onsite in ("standard", "learned"):
            from .engine.replay import MODE
            MODE["onsite"] = r.onsite
    return get_settings()


# ---------------- disruptions ----------------
@app.get("/api/trucks/{u}/breakdown")
def breakdown_preview(u: int):
    with W.lock:
        b = W.breakdown_preview(u)
        if b.get("err"):
            return b
        tr = W.R.trucks
        return {"u": u, "veh": tr[u]["veh"], "T": b["T"], "site": b["site"], "on": b["on"], "dels": b["dels"], "pks": b["pks"],
                "rescue": [dict(r, veh=tr[r["u"]]["veh"]) for r in b["rescue"]],
                "moves": [{"pid": m["pid"], "a": short(W.R.pickups[m["pid"]]["a"]), "to": tr[m["o"]["u"]]["veh"] if m["o"] else None,
                           "arr": m["o"]["arr"] if m["o"] else None} for m in b["moves"]]}


@app.post("/api/trucks/{u}/breakdown")
def breakdown_apply(u: int):
    return W.breakdown_apply(u)


@app.get("/api/trucks/{u}/sick")
def sick_preview(u: int):
    with W.lock:
        o = W.sick_preview(u)
        if o.get("err"):
            return o
        tr = W.R.trucks; b = o.get("share")
        if b:
            o["share"] = {"T": b["T"], "site": b["site"], "on": b["on"], "dels": b["dels"], "pks": b["pks"], "morning": b["morning"],
                          "rescue": [dict(r, veh=tr[r["u"]]["veh"]) for r in b["rescue"]],
                          "moves": [{"pid": m["pid"], "a": short(W.R.pickups[m["pid"]]["a"]), "to": tr[m["o"]["u"]]["veh"] if m["o"] else None,
                                     "arr": m["o"]["arr"] if m["o"] else None} for m in b["moves"]]}
        return o


class SickReq(BaseModel):
    choice: str


@app.post("/api/trucks/{u}/sick")
def sick_apply(u: int, r: SickReq):
    return W.sick_apply(u, r.choice)


# ---------------- bookings (Web Dispatch portal, CSR phone/email entry) ----------------
class Party(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    address: str = Field(min_length=3, max_length=160)
    city: str = ""
    lat: float = Field(ge=41, le=47)
    lng: float = Field(ge=-84, le=-74)
    contact: str = ""
    phone: str = ""


@app.get("/api/customers/lookup")
def customer_lookup(contact: str = "", account: str = ""):
    with W.lock:
        return W.lookup(contact, account)


class BookingReq(BaseModel):
    channel: str = "Phone (entered in Elite)"
    contact: str = ""                          # caller's phone or email: identifies a returning customer automatically
    account: str = ""                          # Elite customer account, if staff picked one
    shipper: Party
    consignee: Party
    pieces: int = Field(ge=1, le=500)
    piece_type: str = "SKD"
    weight: float = Field(gt=0, le=44000)
    spots: float = Field(gt=0, le=26)          # skid spots are required here (the free fix from our data check)
    length: float | None = Field(default=None, gt=0, le=636)    # inches per piece (optional): skid spots worked out from the size
    width: float | None = Field(default=None, gt=0, le=102)
    height: float | None = Field(default=None, gt=0, le=110)
    stackable: bool = False                    # may go two high (never for dangerous goods)
    tdg: bool = False                          # dangerous goods (TDG)
    audience: bool = False                     # booked from a phone in the room (QR on the dispatcher screen)
    equipment: str = "TRUCK"
    tailgate: bool = False
    ready: float | None = None                 # minutes after midnight; default = now
    close: float | None = 17 * 60
    service: str = "OVERNIGHT"                 # RUSH | SAME DAY | OVERNIGHT | OUT OF TOWN (Trans Ontario service levels)
    deliver_appt: float | None = None          # delivery appointment (minutes after midnight), same-day services
    ref: str = ""
    notes: str = ""


@app.get("/api/rules")
def rules():
    """What the engine checks for every truck, and what is simplified (for the Rules panel)."""
    from .engine.replay import DWELL, MODE
    m = (DWELL or {}).get("metrics", {})
    cyc = sorted(((t["cycle_min"], t["veh"]) for t in W.R.trucks), reverse=True)[:1]
    return {"rules": [
        {"area": "Vehicle capacity", "how": "Weight and floor spots on board at every stop: straight truck 15,000 lb / 12 skids, 53' trailer 44,000 lb / 26 skids (trans-ontario.com), floor planned to 95%", "status": "checked"},
        {"area": "Legal weight", "how": "Uses the lower published axle limit for each type (single-axle straight, tandem 53'); axle type per unit and spring load restrictions are not in the data", "status": "simplified"},
        {"area": "Driver hours", "how": f"14 h on duty today and 70 h in 7 days (past 6 days from Samsara HOS{', highest: ' + cyc[0][1] + ' ' + format(cyc[0][0] / 60, '.0f') + ' h' if cyc else ''}). The 13 h driving limit is not counted separately (stop time is part of every day)", "status": "checked"},
        {"area": "Driver qualifications", "how": "53' trailer needs AZ, straight truck AZ or DZ (spare driver matched by licence). TDG certificate is not in the data: dangerous goods are flagged to confirm", "status": "simplified"},
        {"area": "Equipment compatibility", "how": "53' only freight, tailgate (no dock) only on straight trucks, height vs inside height (assumed 96 in straight, 108 in 53')", "status": "checked"},
        {"area": "Dimensions and stacking", "how": "Size per piece turns into 48 x 40 in skid spots; stackable up to 48 in goes two high; dangerous goods never stacked", "status": "checked"},
        {"area": "Delivery windows", "how": "Appointments + 15 min, customer closing (17:00 unless Elite says otherwise), service cutoffs: Rush 3:30, Out of town 1:30, others 5 pm; same-day freight delivered today", "status": "checked"},
        {"area": "Cargo securement and unloading order", "how": "Driver's load plan: next delivery at the door, last at the nose; straps / load bars from Elite flags and for partial loads", "status": "checked"},
        {"area": "Transportation regulations", "how": "Hours of service and weights as above; TDG flagged; no border or permit rules (Ontario / Quebec only)", "status": "simplified"},
        {"area": "On-site time (predictive)", "how": (f"Switch in the dispatcher (now: {'learned' if MODE['onsite'] == 'learned' else 'standard 12 min + 3 per skid'}). Learned from {m.get('n_train')} real stops; on {m.get('n_test')} stops it never saw, average error {m.get('mae_model')} min vs {m.get('mae_flat')} min for a flat rule, and it underestimates by {m.get('bias_model')} min instead of {m.get('bias_flat')} min" if m else "Flat rule (no model file)"), "status": "checked"},
        {"area": "Travel times", "how": "Straight-line distance × 1.4, speed by trip length, calibrated on their GPS. Real roads and traffic: next", "status": "simplified"},
    ], "dwell": m, "stress": _stress(), "decide_ms": round(sorted(getattr(W, "decide_ms", [0]))[len(getattr(W, "decide_ms", [0])) // 2]),
        "trucks": len(W.R.trucks), "fill_now": _fill_now()}


def _fill_now():
    with W.lock:
        f = [W.R.state(t["i"], W.T)["fill"] for t in W.R.trucks]
        on = [x for t, x in zip(W.R.trucks, f) if W.R.state(t["i"], W.T)["status"] in ("moving", "stop")]
    return round(100 * sum(on) / len(on)) if on else 0


def _stress():
    try:
        return json.load(open(C.DATA_FILE.with_name("stress.json")))
    except Exception:
        return None


@app.get("/api/services")
def services():
    with W.lock:
        return {"clock": W.clock(), "services": W.booking_window(), "contact": C.CONTACT}


@app.post("/api/bookings")
def book(r: BookingReq, request: Request):
    who = request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "?")
    return W.book(r.model_dump(), client=who)


@app.get("/api/track/{ordno}")
def track(ordno: str):
    with W.lock:
        t = W.track(ordno)
    if not t:
        raise HTTPException(404, "Order not found")
    return t


# ---------------- driver (optional, through the Samsara driver app) ----------------
class SpaceReq(BaseModel):
    free: float = Field(ge=0, le=26)


@app.post("/api/driver/{u}/space")
def driver_space(u: int, r: SpaceReq):
    return W.report_space(u, r.free)


class GapReq(BaseModel):
    minutes: float = 20


@app.post("/api/driver/{u}/gps-gap")
def driver_gps_gap(u: int, r: GapReq):
    W.gps_gap(u, r.minutes); return {"ok": True}


class OfferReq(BaseModel):
    action: str = "ack"            # ack | decline
    reason: str | None = None      # no_room | too_late | equipment | hours | other
    note: str = ""


@app.post("/api/driver/{u}/offer")
def driver_offer(u: int, r: OfferReq):
    return W.offer_reply(u, r.action, r.reason, r.note)


@app.get("/api/decline-reasons")
def decline_reasons():
    return W.DECLINE_REASONS


class DeclineReq(BaseModel):
    decision: str                  # approve | override
    note: str = ""


@app.post("/api/trucks/{u}/decline")
def decide_decline(u: int, r: DeclineReq):
    return W.decide_decline(u, r.decision, r.note)


@app.post("/api/trucks/{u}/confirm-call")
def confirm_call(u: int):
    """The dispatcher phoned a driver who didn't answer the app, and the driver confirmed."""
    return W.confirm_by_phone(u)


class ProblemReq(BaseModel):
    kind: str = "sick"             # sick | truck | late | notready | failed
    minutes: float | None = None   # late / notready: about how long


@app.post("/api/driver/{u}/problem")
def driver_problem(u: int, r: ProblemReq):
    return W.report_problem(u, r.kind, r.minutes)


@app.get("/api/trucks/{u}/problem")
def problem_options(u: int):
    return W.problem_options(u)


class ProblemApplyReq(BaseModel):
    choice: str = "apply"          # late: apply · notready: wait | leave · failed: back | retry
    minutes: float | None = None


@app.post("/api/trucks/{u}/problem")
def problem_apply(u: int, r: ProblemApplyReq):
    return W.problem_apply(u, r.choice, r.minutes)


@app.post("/api/orders/{pid}/cancel")
def cancel_order(pid: int):
    return W.cancel_order(pid)


@app.post("/api/driver/{u}/ping")
def driver_ping(u: int):
    import time
    W.driver_seen[u] = time.time(); return {"ok": True}


# ---------------- live feed ----------------
@app.websocket("/ws")
async def ws(sock: WebSocket):
    await sock.accept()
    try:
        while True:
            await sock.send_json(W.snapshot())
            await asyncio.sleep(1)
    except (WebSocketDisconnect, RuntimeError):
        pass


@app.on_event("startup")
async def start_share():
    share.start_tunnel()


@app.on_event("startup")
async def start_clock():
    async def loop():
        while True:
            await asyncio.sleep(0.5)
            W.tick(0.5)
    asyncio.create_task(loop())


# ---------------- the three apps ----------------
DIST = C.ROOT / "web" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/")
def root():
    return RedirectResponse("/dispatch")


@app.get("/{page}")
def page(page: str):
    f = DIST / f"{page}.html"
    if page in ("dispatch", "elite", "driver", "plan", "book") and f.exists():
        return FileResponse(f)
    if (DIST / page).is_file():
        return FileResponse(DIST / page)
    raise HTTPException(404)
