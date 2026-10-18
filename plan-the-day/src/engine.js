/* Trans Ontario dispatch planner — planning engine (no DOM).
   Regret-2 insertion + relocate local search for a single-depot pickup & delivery
   problem with capacity (weight + floor spots), equipment, licence, appointment,
   service-promise, hours-of-service and pickup-before-delivery constraints.
   Exposed as window.Engine (browser) or module.exports (node). */
(function (root) {
  "use strict";

  const DEFAULTS = {
    start: 420,            // 07:00 normal depot departure
    earliestStart: 240,    // 04:00 earliest departure when an early appointment needs it
    closeD: 1020,          // receivers close 17:00 (soft promise when no Elite time)
    closeP: 1020,          // shippers close 17:00 (soft)
    softEnd: 1050,         // 17:30: after this, overtime premium
    maxDuty: 14 * 60,      // Canadian HOS: 14 h on-duty per day
    maxDrive: 13 * 60,     // Canadian HOS: 13 h driving per day
    apptEarly: 60,         // may arrive up to 60 min before an appointment (then waits)
    apptGrace: 15,         // hard: no later than 15 min after an appointment
    circuity: 1.4,         // road km / straight-line km (calibrated: median 1.5 on the sample)
    svcBase: 12, svcPerSpot: 3, svcMax: 60,
    fillMax: 0.95,         // plan floor space to 95% (securement, load bars, irregular freight)
    latePen: 2.5,          // $ per minute late vs service promise
    overtimeMult: 0.5,     // extra 50% of hourly rate after softEnd
    partners: false,       // partner carriers: off (the shared data has none); turn on to test handing far freight to a partner
    partnerMinKm: 90,      // only freight this far (road km) from the depot is offered to partners
    partner: { base: 95, perCwt: 4.0, perCwtPer100Km: 2.5 },
    classes: {
      VAN: { label: "Cargo van", cap: 2000, spots: 2, lic: ["G", "DZ", "AZ"], perKm: 0.55, perHr: 32, fixed: 60, tailgate: true },
      ST:  { label: "Straight truck 26 ft", cap: 15000, spots: 12, lic: ["DZ", "AZ"], perKm: 1.05, perHr: 38, fixed: 140, tailgate: true },
      TT:  { label: "Tractor + 53 ft trailer", cap: 44000, spots: 26, lic: ["AZ"], perKm: 1.6, perHr: 42, fixed: 220, tailgate: false },
    },
  };

  const R = 6371;
  function hav(a, b) {
    const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
    const dla = la2 - la1, dlo = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  const fmtT = m => { if (m == null) return "—"; m = Math.round(m); const h = Math.floor(m / 60), mm = m % 60; return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0"); };
  const fmtN = n => Math.round(n).toLocaleString("en-CA");

  function Planner(dayData, depot, cfg) {
    this.cfg = Object.assign(clone(DEFAULTS), cfg ? clone(cfg) : {});
    this.depot = depot;
    this.jobs = clone(dayData.jobs);
    this.units = clone(dayData.units).map((u, i) => Object.assign(u, { i, down: false }));
    this.spares = clone(dayData.spares || []);
    this.spareVeh = clone(dayData.spareVeh || []);
    for (const [p, d] of dayData.pairs) {
      const A = this.jobs[p], B = this.jobs[d];
      A.dst = [d]; B.src = p;
      // a co-located delivery can carry other orders too; never let the truck unload more than it picked up
      if (B.w > A.w) A.w = B.w;
      if (B.sp > A.sp) A.sp = B.sp;
    }
    for (const j of this.jobs) {
      if (j.appt != null && j.appt < 240) { j.f.push(["warn", "Appointment " + fmtT(j.appt) + " looks invalid (before 04:00) — ignored"]); j.appt = null; }
      if (j.rdy != null && j.rdy >= 1140) j.f.push(["warn", "Freight ready after 19:00 — needs an after-hours run"]);
      j.km0 = hav(depot, j) * this.cfg.circuity;
      j.svcT = Math.min(this.cfg.svcMax, this.cfg.svcBase + this.cfg.svcPerSpot * j.sp);
    }
    this.T = this.cfg.start;
    this.routes = this.units.map(u => this.emptyRoute(u.i));
    this.partner = [];
    this.unserved = [];
    this.log = [];
    this._mark = new Int32Array(4096); this._stamp = 0;
  }
  const P = Planner.prototype;

  P.emptyRoute = function (ui) {
    return { u: ui, done: [], doneT: [], seq: [], t0: this.cfg.start, pos: this.depot, ob: { w: 0, sp: 0 }, driveUsed: 0, kmUsed: 0, costUsed: 0 };
  };

  P.travel = function (a, b) {
    const h = hav(a, b);
    if (h < 0.05) return { km: 0, min: 0 };
    const v = 18 + 37 * Math.pow(Math.min(1, h / 50), 0.7); // km/h vs straight-line km, calibrated on sample GPS legs
    return { km: h * (1.2 + 0.25 * Math.exp(-h / 30)), min: 4 + h / v * 60 };
  };

  P.due = function (J) {
    if (J.appt != null) return J.appt;
    if (J.due != null) return J.due;
    if (J.t === "P" || J.t === "X") return Math.max(this.cfg.closeP, (J.rdy || 0) + 90);
    return this.cfg.closeD;
  };

  // Reason a unit can never serve a job (empty string = compatible)
  P.compat = function (u, J) {
    const U = this.units[u], C = this.cfg.classes[U.vc];
    if (U.down) return "Unit out of service";
    if (J.t === "X") return J.w > C.cap ? "Transload exceeds payload" : "";
    if (J.eq === "TT" && U.vc !== "TT") return "Order requests " + (J.eqr || "a 53 ft trailer");
    if (J.eq === "ST" && U.vc === "VAN") return "Van too small for truck freight";
    if (/tailgate|residential|inside delivery/.test(J.h) && !C.tailgate) return "53 ft trailer can't do " + J.h.match(/tailgate|residential|inside delivery/)[0] + " delivery";
    if (J.w > C.cap) return fmtN(J.w) + " lb > " + fmtN(C.cap) + " lb payload";
    if (J.sp > C.spots) return J.sp + " skid spots > " + C.spots + " on " + C.label;
    if (!C.lic.includes(U.lic)) return "Driver licence " + U.lic + " not valid for " + C.label;
    return "";
  };

  // Evaluate a route's remaining sequence. audit=true never aborts and lists every violation.
  P.evalSeq = function (r, seq, audit) {
    const cfg = this.cfg, U = this.units[r.u], C = cfg.classes[U.vc], jobs = this.jobs;
    if (this._mark.length < jobs.length) { this._mark = new Int32Array(jobs.length * 2); this._stamp = 0; }
    const S = ++this._stamp, M = this._mark;
    for (let k = 0; k < seq.length; k++) M[seq[k]] = S;
    let w = r.ob.w, sp = r.ob.sp;
    for (const j of seq) { const J = jobs[j]; if (J.t === "D" && !(J.src != null && M[J.src] === S)) { w += J.w; sp += J.sp; } }
    let tStart = r.t0;
    if (!r.done.length && seq.length) {
      const F = jobs[seq[0]];
      if (F.appt != null) { const need = F.appt - cfg.apptEarly - this.travel(r.pos, F).min; if (need < tStart) tStart = Math.max(cfg.earliestStart, need); }
    }
    const dutyStart = r.done.length ? (r.dutyStart != null ? r.dutyStart : cfg.start) : tStart;
    let maxW = w, maxSp = sp, t = tStart, pos = r.pos, km = 0, drive = 0, late = 0, nLate = 0;
    const times = [], viol = [];
    const visited = new Set();
    for (let k = 0; k < seq.length; k++) {
      const J = jobs[seq[k]];
      if (J.t === "D" && J.src != null && M[J.src] === S && !visited.has(J.src)) {
        if (!audit) return { ok: false, why: "Delivery before its pickup" };
        viol.push({ k, sev: "crit", msg: "Delivered before pickup" });
      }
      const leg = this.travel(pos, J);
      km += leg.km; drive += leg.min; t += leg.min;
      const open = J.appt != null ? J.appt - cfg.apptEarly : (J.rdy || 0);
      if (!audit && t < open) t = open;
      if (J.appt != null && t > J.appt + cfg.apptGrace) {
        if (!audit) return { ok: false, why: "Misses " + fmtT(J.appt) + " appointment" };
        viol.push({ k, sev: "crit", msg: "Missed " + fmtT(J.appt) + " appointment by " + Math.round(t - J.appt) + " min" });
      }
      const due = this.due(J);
      if (t > due + 0.5) { late += t - due; nLate++; if (audit) viol.push({ k, sev: "warn", msg: "Late vs promise " + fmtT(due) + " by " + Math.round(t - due) + " min" }); }
      times.push(t);
      t += J.svcT;
      if (J.t === "P" || J.t === "X") { w += J.w; sp += J.sp; } else { w -= J.w; sp -= J.sp; }
      if (w > maxW) maxW = w; if (sp > maxSp) maxSp = sp;
      visited.add(seq[k]);
      pos = J;
    }
    late += r.lateUsed || 0; nLate += r.nLateUsed || 0;
    const back = this.travel(pos, this.depot);
    km += back.km; drive += back.min; t += back.min;
    const duty = t - dutyStart, driveAll = drive + r.driveUsed;
    if (maxW > C.cap + 0.5) { if (!audit) return { ok: false, why: "Overweight: peak " + fmtN(maxW) + " lb > " + fmtN(C.cap) }; viol.push({ k: -1, sev: "crit", msg: "Overloaded: peak " + fmtN(maxW) + " lb on " + fmtN(C.cap) + " lb payload" }); }
    if (maxSp > (audit || seq.length + r.done.length <= 2 ? C.spots : C.spots * cfg.fillMax) + 0.01) { if (!audit) return { ok: false, why: "Out of floor space: " + maxSp.toFixed(1) + " > " + (C.spots * cfg.fillMax).toFixed(1) + " usable spots" }; viol.push({ k: -1, sev: "crit", msg: "Over floor space: " + maxSp.toFixed(1) + " of " + C.spots + " skid spots" }); }
    if (duty > cfg.maxDuty) { if (!audit) return { ok: false, why: "Exceeds 14 h on-duty limit" }; viol.push({ k: -1, sev: "crit", msg: "On-duty " + (duty / 60).toFixed(1) + " h exceeds 14 h limit" }); }
    if (driveAll > cfg.maxDrive) { if (!audit) return { ok: false, why: "Exceeds 13 h driving limit" }; viol.push({ k: -1, sev: "crit", msg: "Driving exceeds 13 h limit" }); }
    if (audit) for (let k = 0; k < seq.length; k++) { const c = this.compat(r.u, jobs[seq[k]]); if (c) viol.push({ k, sev: "crit", msg: c }); }
    const used = seq.length + r.done.length > 0;
    const ot = Math.max(0, t - cfg.softEnd);
    const cost = !used ? 0 : C.fixed + C.perKm * (km + r.kmUsed) + C.perHr * duty / 60 + C.perHr * cfg.overtimeMult * ot / 60 + cfg.latePen * late;
    return { ok: true, start: dutyStart, km: km + r.kmUsed, drive: driveAll, end: t, duty: used ? duty : 0, late, nLate, maxW, maxSp, cost, times, viol, used };
  };

  P.routeEval = function (r) {
    if (r._ev) return r._ev;
    let ev = this.evalSeq(r, r.seq, false);
    if (!ev.ok) { const a = this.evalSeq(r, r.seq, true); a.ok = false; a.why = ev.why; a.cost += 1000; ev = a; }
    return (r._ev = ev);
  };
  P.setSeq = function (r, seq) { r.seq = seq; r._ev = null; };

  // Best feasible insertion of a group ([j] or [p,d]) into route r.
  P.bestInsert = function (r, g) {
    for (const j of g) { const c = this.compat(r.u, this.jobs[j]); if (c) return { why: c }; }
    const base = this.routeEval(r);
    const seq = r.seq, n = seq.length;
    let best = null, why = null;
    const jobs = this.jobs;
    if (g.length === 1) {
      const J = jobs[g[0]];
      let lo = 0, hi = n;
      if (J.t === "D" && J.src != null) { const s = seq.indexOf(J.src); if (s >= 0) lo = s + 1; else if (!r.done.includes(J.src)) return { why: "Pickup not on this truck" }; }
      if (J.dst) for (const d of J.dst) { const s = seq.indexOf(d); if (s >= 0) hi = Math.min(hi, s); }
      for (let i = lo; i <= hi; i++) {
        const s2 = seq.slice(0, i); s2.push(g[0]); for (let k = i; k < n; k++) s2.push(seq[k]);
        const ev = this.evalSeq(r, s2, false);
        if (!ev.ok) { why = why || ev.why; continue; }
        const d = ev.cost - base.cost;
        if (!best || d < best.delta) best = { delta: d, seq: s2, ev };
      }
    } else {
      for (let i = 0; i <= n; i++) for (let k = i; k <= n; k++) {
        const s2 = [];
        for (let m = 0; m <= n; m++) { if (m === i) s2.push(g[0]); if (m === k) s2.push(g[1]); if (m < n) s2.push(seq[m]); }
        const ev = this.evalSeq(r, s2, false);
        if (!ev.ok) { why = why || ev.why; continue; }
        const d = ev.cost - base.cost;
        if (!best || d < best.delta) best = { delta: d, seq: s2, ev };
      }
    }
    return best || { why: why || "No feasible position" };
  };

  P.groupOf = function (j) {
    const J = this.jobs[j];
    if (J.t === "D" && J.src != null && this.jobs[J.src].t === "P") return this.groupOf(J.src);
    if (J.dst && J.t === "P") return [j].concat(J.dst);
    return [j];
  };

  // Regret-2 insertion of a set of groups into live (non-down) routes.
  P.insertGroups = function (groups, opts) {
    opts = opts || {};
    const live = this.routes.filter(r => !this.units[r.u].down && (!opts.only || opts.only.includes(r.u)));
    const cache = groups.map(g => live.map(r => this.bestInsert(r, g)));
    const pending = new Set(groups.map((_, i) => i));
    while (pending.size) {
      let pick = -1, pickScore = -Infinity, pickBest = null, pickR = -1;
      for (const gi of pending) {
        let b1 = Infinity, b2 = Infinity, br = -1;
        cache[gi].forEach((res, ri) => { if (res.delta == null) return; if (res.delta < b1) { b2 = b1; b1 = res.delta; br = ri; } else if (res.delta < b2) b2 = res.delta; });
        if (br < 0) continue;
        const hard = groups[gi].some(j => this.jobs[j].appt != null) ? 1e5 : 0;
        const score = (b2 === Infinity ? 1e6 : b2 - b1) + hard;
        if (score > pickScore) { pickScore = score; pick = gi; pickBest = cache[gi][br]; pickR = br; }
      }
      if (pick < 0) break;
      const r = live[pickR];
      this.setSeq(r, pickBest.seq);
      pending.delete(pick);
      for (const gi of pending) cache[gi][pickR] = this.bestInsert(r, groups[gi]);
    }
    const failed = [];
    for (const gi of pending) {
      const reasons = {};
      cache[gi].forEach((res, ri) => { const k = res.why || "?"; reasons[k] = (reasons[k] || 0) + 1; });
      failed.push({ g: groups[gi], reasons });
    }
    return failed;
  };

  P.totalCost = function () {
    let c = 0; for (const r of this.routes) c += this.routeEval(r).cost;
    for (const j of this.partner) c += this.jobs[j].partnerCost || this.partnerCost(this.jobs[j]);
    return c;
  };

  // Relocate local search: move whole groups (and only movable stops) to their best route/position.
  P.improve = function (budgetMs) {
    const t0 = Date.now();
    let improved = true, passes = 0;
    while (improved && passes < 8 && Date.now() - t0 < budgetMs) {
      improved = false; passes++;
      for (const r of this.routes) {
        if (this.units[r.u].down) continue;
        for (const j of r.seq.slice()) {
          if (!r.seq.includes(j)) continue;
          const J = this.jobs[j];
          if (J.t === "D" && J.src != null && !r.seq.includes(J.src)) continue; // freight already on this truck
          if (J.t === "X") continue;
          const g = this.groupOf(j);
          if (g[0] !== j) continue;
          if (!g.every(x => r.seq.includes(x))) continue;
          const before = this.routeEval(r).cost;
          const reduced = r.seq.filter(x => !g.includes(x));
          const save = before - this.evalSeq(r, reduced, false).cost;
          let best = null, bestR = null;
          const oldSeq = r.seq;
          this.setSeq(r, reduced);
          for (const r2 of this.routes) {
            if (this.units[r2.u].down) continue;
            const b = this.bestInsert(r2, g);
            if (b.delta != null && (!best || b.delta < best.delta)) { best = b; bestR = r2; }
          }
          if (best && best.delta < save - 0.5) { this.setSeq(bestR, best.seq); improved = true; }
          else this.setSeq(r, oldSeq);
        }
      }
    }
    return passes;
  };

  P.partnerCost = function (J) {
    const p = this.cfg.partner, cwt = Math.max(1, J.w / 100);
    return p.base + cwt * (p.perCwt + p.perCwtPer100Km * J.km0 / 100);
  };

  // Hand far-away freight to a partner when it is cheaper than our own marginal cost.
  P.groupPartnerCost = function (g) {
    const J0 = this.jobs[g[0]];
    if (g.length === 1) return this.partnerCost(J0);
    const p = this.cfg.partner, cwt = Math.max(1, J0.w / 100), d = hav(J0, this.jobs[g[1]]) * this.cfg.circuity;
    return p.base * 1.5 + cwt * (p.perCwt + p.perCwtPer100Km * d / 100);
  };

  // Hand far-away freight to a partner when that is cheaper than our own marginal cost.
  P.partnerPass = function () {
    let moved = 0;
    if (!this.cfg.partners) return moved;
    for (const r of this.routes) {
      for (const j of r.seq.slice()) {
        const J = this.jobs[j];
        if (J.t === "X" || J.appt != null || !r.seq.includes(j)) continue;
        const g = this.groupOf(j);
        if (g[0] !== j || !g.every(x => r.seq.includes(x))) continue;
        if (!g.some(x => this.jobs[x].km0 >= this.cfg.partnerMinKm)) continue;
        const before = this.routeEval(r).cost;
        const red = r.seq.filter(x => !g.includes(x));
        const save = before - this.evalSeq(r, red, false).cost;
        const pc = this.groupPartnerCost(g);
        if (pc < save) {
          this.setSeq(r, red);
          for (const x of g) { this.partner.push(x); this.jobs[x].partnerCost = pc / g.length; this.jobs[x].ownCost = save / g.length; this.jobs[x].partnerFrom = this.units[r.u].veh; }
          moved++;
        }
      }
    }
    return moved;
  };

  P.planDay = function (budgetMs) {
    const t0 = Date.now();
    const groups = [], seen = new Set();
    for (const J of this.jobs) {
      if (seen.has(J.id)) continue;
      const g = this.groupOf(J.id); g.forEach(x => seen.add(x)); groups.push(g);
    }
    // order: appointments and big/TT freight first is handled by regret; seed with nothing
    const failed = this.insertGroups(groups);
    this.handleFailed(failed);
    this.improve(budgetMs || 1500);
    this.partnerPass();
    this.improve(400);
    this.ms = Date.now() - t0;
    return this;
  };

  P.handleFailed = function (failed) {
    for (const f of failed) {
      const top = Object.entries(f.reasons).sort((a, b) => b[1] - a[1]).map(e => e[0]);
      const J = this.jobs[f.g[0]];
      if (this.cfg.partners && f.g.length === 1 && J.t !== "X" && J.w <= 44000 && J.km0 >= this.cfg.partnerMinKm) { this.partner.push(J.id); J.partnerCost = this.partnerCost(J); J.partnerWhy = top[0]; }
      else this.unserved.push({ g: f.g, why: top.slice(0, 2) });
    }
  };

  // ---------- results ----------
  P.summary = function () {
    let km = 0, duty = 0, cost = 0, nLate = 0, used = 0, served = 0, util = [], late = 0, tt = 0;
    for (const r of this.routes) {
      const ev = this.routeEval(r);
      if (!ev.used) continue;
      used++; km += ev.km; duty += ev.duty; cost += ev.cost; nLate += ev.nLate; late += ev.late;
      served += r.seq.length + r.done.length;
      const C = this.cfg.classes[this.units[r.u].vc];
      util.push(Math.max(ev.maxW / C.cap, ev.maxSp / C.spots));
    }
    const pc = this.partner.reduce((s, j) => s + (this.jobs[j].partnerCost || this.partnerCost(this.jobs[j])), 0);
    const nCust = this.jobs.filter(j => j.t !== "X" && !j.ghost).length;
    return { used, km, duty, cost: cost + pc, fleetCost: cost, partnerCost: pc, nLate, late, served, nPartner: this.partner.length, nUnserved: this.unserved.reduce((s, u) => s + u.g.length, 0), util: util.length ? util.reduce((a, b) => a + b, 0) / util.length : 0, onTime: served ? 1 - nLate / served : 1, nCust };
  };

  // Evaluate what dispatch actually did, with the same cost/time model and rules.
  P.auditActual = function () {
    const out = [];
    let km = 0, duty = 0, cost = 0, nLate = 0, used = 0, served = 0, util = [];
    for (const U of this.units) {
      const js = this.jobs.filter(j => j.act && j.act.drv === U.did && j.act.arr != null).sort((a, b) => a.act.arr - b.act.arr);
      if (!js.length) continue;
      const C = this.cfg.classes[U.vc];
      const r = this.emptyRoute(U.i);
      const ev = this.evalSeq(r, js.map(j => j.id), true);
      const viol = [];
      // load is checked per Samsara route: a new route = the truck went back to the depot and reloaded
      const trips = {};
      for (const j of js) (trips[j.act.rt] = trips[j.act.rt] || []).push(j.id);
      let peakW = 0, peakSp = 0;
      for (const [rt, ids] of Object.entries(trips)) {
        const e = this.evalSeq(this.emptyRoute(U.i), ids, true);
        peakW = Math.max(peakW, e.maxW); peakSp = Math.max(peakSp, e.maxSp);
        if (e.maxW > C.cap + 0.5) viol.push({ msg: "Overloaded on " + rt + ": peak " + fmtN(e.maxW) + " lb on " + fmtN(C.cap) + " lb payload", job: null });
        if (e.maxSp > C.spots + 0.01) viol.push({ msg: "Over floor space on " + rt + ": " + e.maxSp.toFixed(1) + " of " + C.spots + " skid spots" + (ids.some(i => this.jobs[i].se) ? " (some counts estimated)" : ""), job: null });
      }
      for (const j of js) {
        const c = this.compat(U.i, j); if (c) viol.push({ msg: c, job: j.id });
        if (j.appt != null && j.act.arr > j.appt + this.cfg.apptGrace) viol.push({ msg: "Missed " + fmtT(j.appt) + " appointment by " + Math.round(j.act.arr - j.appt) + " min (GPS)", job: j.id });
      }
      const span = js[js.length - 1].act.dep != null ? js[js.length - 1].act.dep - js[0].act.arr : null;
      if (span != null && span > this.cfg.maxDuty) viol.push({ msg: "Stops span " + (span / 60).toFixed(1) + " h — over the 14 h on-duty limit", job: null });
      let aLate = 0; const lateList = [];
      for (const j of js) { if (j.act.arr > this.due(j)) { aLate++; lateList.push(j.id); } }
      used++; km += ev.km; duty += ev.duty; cost += ev.cost - this.cfg.latePen * ev.late + this.cfg.latePen * js.reduce((s, j) => s + Math.max(0, j.act.arr - this.due(j)), 0); nLate += aLate; served += js.length;
      util.push(Math.max(peakW / C.cap, peakSp / C.spots));
      out.push({ u: U.i, seq: js.map(j => j.id), ev, aLate, lateList, viol, gpsKm: U.act ? U.act.km : null, trips: Object.keys(trips).length });
    }
    return { routes: out, kpi: { used, km, duty, cost, nLate, served, util: util.reduce((a, b) => a + b, 0) / Math.max(1, util.length), onTime: served ? 1 - nLate / served : 1 } };
  };

  // Why is job j on its truck? Alternatives on every other unit.
  P.explain = function (j) {
    const J = this.jobs[j];
    const g = this.groupOf(j);
    let cur = this.routes.find(r => r.seq.includes(j));
    const alts = [];
    let curDelta = null;
    if (cur) {
      const red = cur.seq.filter(x => !g.includes(x));
      curDelta = this.routeEval(cur).cost - this.evalSeq(cur, red, false).cost;
    }
    for (const r of this.routes) {
      if (r === cur) continue;
      const U = this.units[r.u];
      const b = this.bestInsert(r, cur && g.every(x => cur.seq.includes(x)) ? g : [j]);
      alts.push({ u: r.u, veh: U.veh, delta: b.delta, why: b.why, used: this.routeEval(r).used });
    }
    alts.sort((a, b) => (a.delta == null) - (b.delta == null) || (a.delta - b.delta));
    return { cur: cur ? cur.u : null, curDelta, alts, partnerCost: J.t !== "X" ? this.partnerCost(J) : null, group: g };
  };

  // ---------- disruptions ----------
  P.snapshot = function () {
    const s = Object.create(Planner.prototype);
    Object.assign(s, this);
    s.cfg = this.cfg; s.depot = this.depot;
    s.jobs = clone(this.jobs); s.units = clone(this.units);
    s.routes = this.routes.map(r => ({ u: r.u, done: r.done.slice(), doneT: r.doneT.slice(), seq: r.seq.slice(), t0: r.t0, pos: r.pos, ob: Object.assign({}, r.ob), driveUsed: r.driveUsed, kmUsed: r.kmUsed, costUsed: r.costUsed, lateUsed: r.lateUsed || 0, nLateUsed: r.nLateUsed || 0, dutyStart: r.dutyStart }));
    s.partner = this.partner.slice(); s.tomorrow = (this.tomorrow || []).slice(); s.unserved = clone(this.unserved); s.log = this.log.slice();
    s.spares = this.spares; s.spareVeh = clone(this.spareVeh);
    s._mark = new Int32Array(this._mark.length); s._stamp = 0;
    return s;
  };

  // Commit everything that starts before time T; trucks continue from their last stop.
  P.freezeAt = function (T) {
    if (T <= this.T) return;
    for (const r of this.routes) {
      const ev = this.evalSeq(r, r.seq, false);
      if (!r.seq.length) { r.t0 = Math.max(r.t0, T); r._ev = null; continue; }
      if (!ev.ok) continue;
      const n = r.seq.length;
      let k = 0;
      while (k < n && ev.times[k] < T) k++;
      // a truck already driving toward its next stop is committed to it
      const lastDep = k > 0 ? ev.times[k - 1] + this.jobs[r.seq[k - 1]].svcT : r.t0;
      if (k < n && lastDep < T && (k > 0 || r.done.length > 0 || T > r.t0)) k++;
      if (!k) continue;
      const doneNow = r.seq.slice(0, k), rest = r.seq.slice(k);
      const all = new Set(r.seq), restSet = new Set(rest);
      let w = r.ob.w, sp = r.ob.sp;
      for (const j of r.seq) { const J = this.jobs[j]; if (J.t === "D" && !(J.src != null && all.has(J.src))) { w += J.w; sp += J.sp; } }
      if (r.dutyStart == null) r.dutyStart = ev.start;
      let t = ev.start, pos = r.pos, km = 0, drive = 0;
      for (let m = 0; m < k; m++) {
        const J = this.jobs[r.seq[m]]; const leg = this.travel(pos, J);
        km += leg.km; drive += leg.min; t = ev.times[m] + J.svcT; pos = J;
        if (J.t === "P" || J.t === "X") { w += J.w; sp += J.sp; } else { w -= J.w; sp -= J.sp; }
        r.done.push(r.seq[m]); r.doneT.push(ev.times[m]);
        const due = this.due(J); if (ev.times[m] > due) { r.lateUsed = (r.lateUsed || 0) + ev.times[m] - due; r.nLateUsed = (r.nLateUsed || 0) + 1; }
      }
      for (const j of rest) { const J = this.jobs[j]; if (J.t === "D" && !(J.src != null && restSet.has(J.src))) { w -= J.w; sp -= J.sp; } }
      r.ob = { w: Math.max(0, w), sp: Math.max(0, sp) };
      let label = pos.c + (pos.city ? ", " + pos.city : "");
      if (!rest.length && t < T) {
        // heading home: place the truck part-way back to the depot at time T
        const back = this.travel(pos, this.depot), f = Math.min(1, (T - t) / Math.max(1, back.min));
        km += back.km * f; drive += back.min * f;
        pos = { lat: pos.lat + (this.depot.lat - pos.lat) * f, lng: pos.lng + (this.depot.lng - pos.lng) * f };
        label = "en route to depot"; t = T;
      }
      r.t0 = Math.max(t, T); r.pos = { lat: pos.lat, lng: pos.lng, label };
      r.driveUsed += drive; r.kmUsed += km;
      this.setSeq(r, rest);
    }
    this.T = T;
  };

  P.unitRoute = function (u) { return this.routes.find(r => r.u === u); };

  // Freight physically on a truck right now (deliveries it still has to make + pickups not yet returned)
  P.onboardOf = function (r) {
    return r.seq.filter(j => { const J = this.jobs[j]; return J.t === "D" && !(J.src != null && r.seq.includes(J.src)); });
  };

  P.newJob = function (o) {
    const id = this.jobs.length;
    const J = Object.assign({ id, o: "", c: "", a: "", city: "", prov: "ON", w: 0, we: false, pc: 0, pt: "", sp: 0, se: false, lf: null, svc: "", eqr: "", eq: "ANY", h: "", appt: null, rdy: null, due: null, f: [], act: null }, o, { id });
    J.km0 = hav(this.depot, J) * this.cfg.circuity;
    J.svcT = o.svcT != null ? o.svcT : Math.min(this.cfg.svcMax, this.cfg.svcBase + this.cfg.svcPerSpot * J.sp);
    this.jobs.push(J);
    return J;
  };

  function scenarioResult(name, plan, notes) {
    notes = notes || (plan.log || []).slice();
    const kpi = plan.summary();
    for (const r of plan.routes) { const ev = plan.routeEval(r); if (!ev.ok) { notes.push(plan.units[r.u].veh + ": " + ev.why + " — needs a second truck or a dispatcher call"); kpi.nUnserved++; } }
    return { name, plan, kpi, notes };
  }

  // Truck breakdown at time T: compare a recovery truck vs redistributing to the fleet.
  P.breakdown = function (u, T) {
    const base = this.snapshot(); base.freezeAt(T);
    const r0 = base.unitRoute(u);
    const options = [];
    const U = base.units[u];
    const build = (useSpare) => {
      const p = base.snapshot();
      const r = p.unitRoute(u);
      const onboard = p.onboardOf(r);
      const pickups = r.seq.filter(j => !onboard.includes(j));
      const site = { lat: r.pos.lat, lng: r.pos.lng };
      p.units[u].down = true;
      p.setSeq(r, []);
      const notes = [];
      const groups = [];
      const seenG = new Set();
      for (const j of pickups) { const g = p.groupOf(j).filter(x => pickups.includes(x)); if (!g.length || seenG.has(g[0])) continue; g.forEach(x => seenG.add(x)); groups.push(g.length ? g : [j]); }
      let X = null;
      const w = onboard.reduce((s, j) => s + p.jobs[j].w, 0) + r.ob.w, sp = onboard.reduce((s, j) => s + p.jobs[j].sp, 0) + r.ob.sp;
      if (r.done.length && (w > 0 || onboard.length)) {
        X = p.newJob({ t: "X", c: "Transload from " + U.veh, a: "Breakdown site near " + (r.pos.label || "last stop"), lat: site.lat, lng: site.lng, w: Math.round(w), sp: sp, rdy: T + 30, svcT: Math.min(60, 20 + 2 * sp), eq: "ANY", city: "Breakdown" });
        X.dst = onboard.slice();
        for (const j of onboard) p.jobs[j].src = X.id;
        notes.push(Math.round(w).toLocaleString("en-CA") + " lb on board must be transloaded at the breakdown site");
      } else if (onboard.length) {
        for (const j of onboard) groups.push([j]);
      }
      let target = null;
      if (useSpare) {
        const sv = p.spareVeh.find(v => v.vc === U.vc) || p.spareVeh.find(v => v.vc === "TT" || v.vc === "ST");
        if (!sv) return null;
        p.spareVeh = p.spareVeh.filter(v => v !== sv);
        const C2 = p.cfg.classes[sv.vc];
        const sd = p.spares.find(s => C2.lic.includes(s.lic) && !p.units.some(u => u.did === s.did));
        const drv = sd ? { did: sd.did, code: sd.code, name: sd.name, lic: sd.lic } : { did: -1, code: "", name: "On-call driver", lic: C2.lic[0] };
        const nu = Object.assign(clone(U), drv, { i: p.units.length, veh: sv.veh, vc: sv.vc, down: false, f: ["Spare unit dispatched from depot at " + fmtT(T + 15)].concat(sd ? [] : ["No spare driver on the roster — on-call driver assumed"]), act: null, spare: true });
        p.units.push(nu);
        const nr = p.emptyRoute(nu.i); nr.t0 = T + 15;
        p.routes.push(nr);
        target = nu.i;
        notes.push(sv.veh + " leaves the depot at " + fmtT(T + 15) + " with " + nu.name + " (" + nu.lic + ")");
        const un = [];
        if (X) { const fl = p.blockInsert(nr, X.id, X.dst); if (fl === null) { p.setSeq(nr, []); un.push({ g: [X.id].concat(X.dst), why: ["Recovery truck can't take the load"] }); } else p.markStranded(fl); }
        const f1 = p.insertGroups(groups, { only: [nu.i] });
        p.handleFailed(p.insertGroups(f1.map(f => f.g)));
        p.unserved = p.unserved.concat(un);
      } else {
        let failed = [];
        if (X) {
          let best = null;
          for (const r2 of p.routes) { if (p.units[r2.u].down) continue; const s = p.snapshot(); const rr = s.unitRoute(r2.u); const fl = s.blockInsert(rr, X.id, X.dst); if (fl) { const d = s.routeEval(rr).cost - p.routeEval(r2).cost + 400 * fl.length; if (!best || d < best.d) best = { d, u: r2.u, seq: rr.seq, fl }; } }
          if (best) { p.setSeq(p.unitRoute(best.u), best.seq); p.markStranded(best.fl); notes.push(p.units[best.u].veh + " collects the transload and finishes those deliveries"); }
          else p.unserved.push({ g: [X.id].concat(X.dst), why: ["No truck can take the whole load"] });
        }
        failed = failed.concat(p.insertGroups(groups));
        p.handleFailed(failed);
      }
      p.improve(500);
      p.log = notes;
      return p;
    };
    const a = build(true), b = build(false);
    if (a) options.push(scenarioResult("Send a spare truck", a));
    if (b) options.push(scenarioResult("Redistribute to the fleet", b));
    return { title: U.veh + " breaks down at " + fmtT(T), base, options: rank(options), affected: r0.seq.slice(), u };
  };

  // Insert X then its deliveries (after X) into route r. Returns the deliveries that could not be placed, or null if X itself can't go.
  P.blockInsert = function (r, x, ds) {
    const b = this.bestInsert(r, [x]);
    if (b.delta == null) return null;
    this.setSeq(r, b.seq);
    const failed = [];
    for (const d of ds) { const bi = this.bestInsert(r, [d]); if (bi.delta == null) failed.push({ d, why: bi.why }); else this.setSeq(r, bi.seq); }
    return failed;
  };
  P.markStranded = function (failed) {
    for (const f of failed) this.unserved.push({ g: [f.d], why: ["Transloaded but can't be delivered today: " + f.why, "rebook for tomorrow"] });
  };

  // Driver calls in sick before dispatch.
  P.driverOut = function (u) {
    const base = this.snapshot();
    const U = base.units[u];
    const r0 = base.unitRoute(u);
    const options = [];
    const C = base.cfg.classes[U.vc];
    const spare = base.spares.find(s => C.lic.includes(s.lic));
    if (spare) {
      const p = base.snapshot();
      Object.assign(p.units[u], { did: spare.did, code: spare.code, name: spare.name, lic: spare.lic, f: (spare.est ? ["Licence inferred"] : []).concat(["Spare driver covering for " + U.name]) });
      options.push(scenarioResult("Call in spare driver " + spare.name, p, [spare.name + " (" + spare.lic + (spare.est ? ", inferred" : "") + ") takes " + U.veh + " — route unchanged"]));
    }
    const p2 = base.snapshot();
    const r = p2.unitRoute(u); const groups = []; const seen = new Set();
    for (const j of r.seq) { const g = p2.groupOf(j); if (seen.has(g[0])) continue; g.forEach(x => seen.add(x)); groups.push(g); }
    p2.units[u].down = true; p2.setSeq(r, []);
    p2.handleFailed(p2.insertGroups(groups)); p2.improve(500);
    options.push(scenarioResult("Redistribute the route", p2, [r0.seq.length + " stops spread over the fleet"]));
    return { title: U.name + " (" + U.veh + ") calls in sick", base, options: rank(options), affected: r0.seq.slice(), u };
  };

  // Late inbound freight or a new rush order: modelled as a depot (or shipper) pickup that becomes ready at T.
  P.lateFreight = function (spec, T) {
    const base = this.snapshot(); base.freezeAt(T);
    const options = [];
    const mk = (p) => {
      const isDepot = !spec.from;
      const X = p.newJob({ t: isDepot ? "X" : "P", c: isDepot ? "Depot — late inbound freight" : spec.from.c, a: isDepot ? p.depot.addr : spec.from.a, city: isDepot ? "Depot" : spec.from.city, lat: isDepot ? p.depot.lat : spec.from.lat, lng: isDepot ? p.depot.lng : spec.from.lng, w: spec.w, sp: spec.sp, rdy: T, svcT: 15, eq: "ANY", o: spec.o });
      const D = p.newJob({ t: "D", c: spec.to.c, a: spec.to.a, city: spec.to.city, lat: spec.to.lat, lng: spec.to.lng, w: spec.w, sp: spec.sp, due: spec.due, eq: spec.eq || "ST", eqr: spec.eqr || "TRUCK", svc: spec.svc || "RUSH", o: spec.o, h: "", f: [["info", "New order added at " + fmtT(T)]] });
      X.dst = [D.id]; D.src = X.id;
      return [X.id, D.id];
    };
    // option 1: best fleet insertion
    const p1 = base.snapshot(); const g1 = mk(p1);
    const cand = p1.routes.filter(r => !p1.units[r.u].down).map(r => ({ r, b: p1.bestInsert(r, g1) })).filter(c => c.b.delta != null).sort((a, b) => a.b.delta - b.b.delta);
    for (const c of cand.slice(0, 3)) {
      const p = base.snapshot(); const g = mk(p); const rr = p.unitRoute(c.r.u); const b = p.bestInsert(rr, g);
      p.setSeq(rr, b.seq);
      const ev = p.routeEval(rr); const k = rr.seq.indexOf(g[1]);
      options.push(scenarioResult("Add to " + p.units[c.r.u].veh, p, ["Delivery ETA " + fmtT(ev.times[k]) + " · route cost +" + "$" + Math.round(b.delta)]));
    }
    if (this.cfg.partners) {    // option: partner carrier (off unless partners are turned on)
      const pp = base.snapshot(); const gp = mk(pp); pp.partner.push(gp[1]); pp.jobs[gp[0]].partnerHidden = true;
      pp.jobs[gp[1]].partnerCost = pp.partnerCost(pp.jobs[gp[1]]);
      const pr = scenarioResult("Give to a partner carrier", pp, ["Partner quote (modelled) $" + Math.round(pp.partnerCost(pp.jobs[gp[1]])) + " — same-day delivery not guaranteed"]);
      pr.kpi.partnerRisk = true;
      options.push(pr);
    }
    return { title: (spec.from ? "New pickup" : "Late inbound freight") + " ready at " + fmtT(T) + " for " + spec.to.city, base, options: rank(options), affected: [] };
  };

  // Failed delivery at time T: reattempt later today vs bring back to the depot.
  P.failedDelivery = function (j, T) {
    const base = this.snapshot();
    const r0 = base.routes.find(r => r.seq.includes(j));
    if (!r0) return null;
    const ev = base.routeEval(r0); const k = r0.seq.indexOf(j);
    const Tf = Math.max(T, Math.round(ev.times[k] + base.jobs[j].svcT));
    base.freezeAt(Tf);
    const r = base.routes.find(rr => rr.done.includes(j));
    const options = [];
    // the failed stop counted as delivered by freezeAt; put freight back on board
    const J = base.jobs[j];
    const fix = (p) => { const rr = p.unitRoute(r.u); rr.ob = { w: rr.ob.w + J.w, sp: rr.ob.sp + J.sp }; p.jobs[j].failed = true; rr._ev = null; return rr; };
    // A: reattempt in 2 h on the same truck
    const a = base.snapshot(); const ra = fix(a);
    const J2 = a.newJob(Object.assign({}, a.jobs[j], { id: undefined, rdy: Tf + 120, appt: null, act: null, dst: undefined, due: Math.max(a.cfg.closeD, Tf + 150), c: J.c + " (2nd attempt)", f: [["warn", "Re-attempt after failed delivery at " + fmtT(Tf)]] }));
    a.jobs[J2.id].reattemptOf = j;
    ra.ob = { w: ra.ob.w - J.w, sp: ra.ob.sp - J.sp }; // freight is carried by the new D job
    const bi = a.bestInsert(ra, [J2.id]);
    if (bi.delta != null) { a.setSeq(ra, bi.seq); options.push(scenarioResult("Re-attempt today", a, ["Second attempt ETA " + fmtT(a.routeEval(ra).times[ra.seq.indexOf(J2.id)])])); }
    // B: return to depot, deliver tomorrow
    const b = base.snapshot(); const rb = fix(b);
    const mv = b.repair(rb);
    options.push(scenarioResult("Return to depot, deliver tomorrow", b, [fmtN(J.w) + " lb rides back to the depot; re-book for next day"].concat(mv ? [mv + " later pickup(s) moved to other trucks: returned freight takes the space"] : [])));
    return { title: "Failed delivery: " + J.c + " (" + J.city + ") at " + fmtT(Tf), base, options: rank(options), affected: [j] };
  };

  // Make an infeasible route legal again by moving its later pickups to other trucks.
  P.repair = function (r) {
    let moved = 0;
    const out = [];
    while (!this.evalSeq(r, r.seq, false).ok) {
      let idx = -1;
      for (let k = r.seq.length - 1; k >= 0; k--) { const J = this.jobs[r.seq[k]]; if (J.t === "P") { idx = k; break; } }
      if (idx < 0) break;
      const g = this.groupOf(r.seq[idx]).filter(x => r.seq.includes(x));
      this.setSeq(r, r.seq.filter(x => !g.includes(x))); out.push(g); moved += g.length;
    }
    if (out.length) this.handleFailed(this.insertGroups(out));
    return moved;
  };


  // ---------- customer booking: every way to fit a new pickup ----------
  // Freight on board after each stop of seq (and before the first).
  P.loadProfile = function (r, seq) {
    const set = new Set(seq);
    let w = r.ob.w, sp = r.ob.sp;
    for (const j of seq) { const J = this.jobs[j]; if (J.t === "D" && !(J.src != null && set.has(J.src))) { w += J.w; sp += J.sp; } }
    const out = [{ w, sp }];
    for (const j of seq) { const J = this.jobs[j]; if (J.t === "P" || J.t === "X") { w += J.w; sp += J.sp; } else { w -= J.w; sp -= J.sp; } out.push({ w, sp }); }
    return out;
  };

  // Transfer points where freight can change trucks (depot cross-dock + assumed partner yards at highway junctions).
  const HUBS = [
    { c: "Scarborough depot", city: "Scarborough", lat: 43.808, lng: -79.242, depot: true },
  ];

  /* spec: { from:{c,a,city,lat,lng}, to:{...}|null (null = bring to depot), w, sp, eq, eqr, h, ready, pickBy, deadline, o, priority }
     priority: "pickup" | "delivery" | "price". morning: the unfrozen morning plan. exclude: unit ids a driver declined. */
  P.pickupOptions = function (spec, T, morning, exclude) {
    exclude = exclude || [];
    const base = this.snapshot(); base.freezeAt(T);
    const ready = Math.max(T, spec.ready || T);
    const pickBy = spec.pickBy != null ? spec.pickBy : 1140;
    const deadline = spec.deadline != null ? spec.deadline : 1020;
    const common = { w: spec.w, sp: spec.sp, eq: spec.eq || "ST", eqr: spec.eqr || "TRUCK", h: spec.h || "", svc: "BOOKED", o: spec.o, booked: true, f: [["info", "Entered in Elite at " + fmtT(T)]] };
    const job = (t, loc, extra) => base.newJob(Object.assign({}, common, { t, c: loc.c || "", a: loc.a || "", city: loc.city || "", lat: loc.lat, lng: loc.lng, pc: 1, pt: "SKD" }, extra || {}));
    const link = (p, d) => { p.dst = [d.id]; d.src = p.id; };
    const P1 = job("P", Object.assign({ c: "New customer" }, spec.from), { rdy: ready, due: pickBy });
    let P2 = null, D2 = null;
    if (spec.to) { P2 = job("P", Object.assign({ c: "New customer" }, spec.from), { rdy: ready, due: pickBy }); D2 = job("D", Object.assign({ c: "Receiver" }, spec.to), { due: deadline }); link(P2, D2); }
    const A = { lat: spec.from.lat, lng: spec.from.lng };
    const reasons = {};
    const addWhy = (k) => { k = String(k).split(":")[0].replace(/ \d.*$/, ""); reasons[k] = (reasons[k] || 0) + 1; };
    const live = base.routes.filter(r => !base.units[r.u].down && !exclude.includes(r.u) && base.routeEval(r).ok);

    // every legal way to put ids (1 stop, or a pickup→drop pair) into route r without making other stops late
    const insertions = (r, ids, lateOkId) => {
      const bev = base.routeEval(r), seq = r.seq, n = seq.length, out = [];
      let why = null;
      const test = (s2, pIdx, dIdx) => {
        const ev = base.evalSeq(r, s2, false);
        if (!ev.ok) { why = ev.why; return; }
        if (ev.times[pIdx] > base.due(base.jobs[s2[pIdx]]) + 0.5 && base.jobs[s2[pIdx]].t === "P" && base.jobs[s2[pIdx]].booked && !base.jobs[s2[pIdx]].hub) { why = "Can't reach the pickup in time"; return; }
        let own = 0, ownMin = 0;
        if (dIdx != null) { const dd = base.due(base.jobs[s2[dIdx]]); if (ev.times[dIdx] > dd + 0.5) { own = 1; ownMin = ev.times[dIdx] - dd; } }
        if (ev.nLate - own > bev.nLate || ev.late - ownMin > bev.late + 5) { why = "Would make other stops late"; return; }
        if (own && s2[dIdx] !== lateOkId) { why = "Too late for the next leg"; return; }
        out.push({ u: r.u, seq: s2, ev, pIdx, dIdx, pickT: ev.times[pIdx], delT: dIdx != null ? ev.times[dIdx] : null, delta: ev.cost - bev.cost, km: ev.km - bev.km, min: ev.drive - bev.drive, late: own, spare: !bev.used });
      };
      if (ids.length === 2) {
        for (let i = 0; i <= n; i++) for (let k = i; k <= n; k++) {
          const s2 = []; let pIdx = -1, dIdx = -1;
          for (let m = 0; m <= n; m++) { if (m === i) { pIdx = s2.length; s2.push(ids[0]); } if (m === k) { dIdx = s2.length; s2.push(ids[1]); } if (m < n) s2.push(seq[m]); }
          test(s2, pIdx, dIdx);
        }
      } else for (let i = 0; i <= n; i++) test(seq.slice(0, i).concat([ids[0]], seq.slice(i)), i, null);
      return { out, why };
    };
    const keepBest = (L, f1, f2) => { if (!L.length) return []; const a = L.reduce((x, y) => f1(x) <= f1(y) ? x : y), b = L.reduce((x, y) => f2(x) <= f2(y) ? x : y); return a === b ? [a] : [a, b]; };

    // 1) one truck: direct (pickup→delivery) or to the depot
    const cands = [], whyBy = {}, allBy = {};
    base.routes.forEach(r => { if (!live.includes(r)) whyBy[r.u] = base.units[r.u].down ? "Truck out of service" : exclude.includes(r.u) ? "Declined" : "Its own route already breaks a rule"; });
    let bestSpare = null;
    for (const r of live) {
      const c = base.compat(r.u, P1); if (c) { addWhy(c); whyBy[r.u] = c; continue; }
      const got = [];
      if (P2) { const d = insertions(r, [P2.id, D2.id], D2.id); keepBest(d.out, x => x.delta, x => x.pickT).forEach(x => got.push(Object.assign(x, { mode: "direct" }))); if (!d.out.length && d.why) { addWhy(d.why); whyBy[r.u] = d.why; } }
      const s1 = insertions(r, [P1.id]); keepBest(s1.out, x => x.delta, x => x.pickT).forEach(x => got.push(Object.assign(x, { mode: "depot" })));
      if (!got.length && s1.why) { addWhy(s1.why); whyBy[r.u] = s1.why; }
      if (got.length) allBy[r.u] = got;
      for (const x of got) { if (x.spare) { if (!bestSpare || x.delta < bestSpare.delta) bestSpare = x; } else cands.push(x); }
    }
    if (bestSpare) cands.push(bestSpare);

    // 2) relay: truck A brings it to a transfer point, truck B takes it on
    const relays = [];
    if (spec.to) {
      for (const H of HUBS) {
        if (hav(A, H) < 4 || hav(spec.to, H) < 4) continue;
        const Pa = job("P", Object.assign({ c: "New customer" }, spec.from), { rdy: ready, due: pickBy });
        const Ha = job("D", H, { hub: true, due: 1260, svcT: 20 }); link(Pa, Ha);
        const Hb = job("P", H, { hub: true, rdy: ready, due: 1260, svcT: 20 });
        const Db = job("D", Object.assign({ c: "Receiver" }, spec.to), { due: deadline }); link(Hb, Db);
        const legA = [];
        for (const r of live) { if (base.compat(r.u, Pa)) continue; legA.push(...keepBest(insertions(r, [Pa.id, Ha.id]).out, x => x.delta, x => x.delT)); }
        const shortlist = [...new Set(legA.slice().sort((x, y) => x.delT - y.delT).slice(0, 4).concat(legA.slice().sort((x, y) => x.delta - y.delta).slice(0, 4)))];
        for (const a of shortlist) {
          Hb.rdy = Math.round(a.delT + 20);
          for (const r of live) {
            if (r.u === a.u || base.compat(r.u, Hb)) continue;
            for (const b of keepBest(insertions(r, [Hb.id, Db.id], Db.id).out, x => x.delta, x => x.delT)) {
              relays.push({ mode: "relay", hub: H, ids: { Pa: Pa.id, Ha: Ha.id, Hb: Hb.id, Db: Db.id }, a, b, rdyB: Hb.rdy, u: a.u, uB: b.u, seq: a.seq, seqB: b.seq,
                pickT: a.pickT, hubT: a.delT, hubOutT: b.pickT, delT: b.delT, late: b.late, delta: a.delta + b.delta, km: a.km + b.km, min: a.min + b.min, spare: a.spare || b.spare, pIdx: a.pIdx });
            }
          }
        }
      }
    }

    // describe one-truck candidates
    for (const x of cands) {
      const r = base.unitRoute(x.u), U = base.units[x.u], C = base.cfg.classes[U.vc];
      const prev = x.pIdx === 0 ? r.pos : base.jobs[x.seq[x.pIdx - 1]];
      let ni = x.pIdx + 1; if (D2 && x.seq[ni] === D2.id) ni++;
      const next = ni < x.seq.length ? base.jobs[x.seq[ni]] : null;
      const tags = [];
      if (x.spare) tags.push("Spare truck from the depot");
      else {
        if (x.pIdx === 0 && r.done.length) tags.push("Goes there next");
        const stopNear = [prev, next].find(q => q && q.c && q.id != null && hav(q, A) < 3);
        if (stopNear) tags.push("Next to its stop at " + stopNear.c + (stopNear.city ? ", " + stopNear.city : ""));
        const after = x.seq.slice(x.pIdx + 1).filter(j => !D2 || j !== D2.id);
        if (!after.length && (r.seq.length || r.done.length)) tags.push("On its way back to the depot");
        if (x.km <= 8 || (prev && next && x.km <= 0.15 * hav(prev, next) * 1.3)) tags.push("On the way");
      }
      const prof = base.loadProfile(r, x.seq.filter(j => j !== x.seq[x.pIdx] && (!D2 || j !== D2.id)));
      const before = prof[Math.min(prof.length - 1, x.pIdx)];
      Object.assign(x, { freeSp: Math.max(0, C.spots - before.sp), freeW: Math.max(0, C.cap - before.w), tags, veh: U.veh, driver: (U.code ? U.code + " " : "") + U.name });
    }
    for (const x of relays) {
      const UA = base.units[x.u], UB = base.units[x.uB];
      Object.assign(x, { veh: UA.veh, vehB: UB.veh, driver: (UA.code ? UA.code + " " : "") + UA.name, driverB: (UB.code ? UB.code + " " : "") + UB.name,
        tags: [UA.veh + " → " + x.hub.c + " (" + fmtT(x.hubT) + ")", UB.veh + " collects " + fmtT(x.hubOutT) + " → " + spec.to.city] });
    }

    // customer price (illustrative): base fare + our marginal cost with margin
    const price = x => Math.max(65, Math.round((55 + 1.35 * Math.max(0, x.delta)) / 5) * 5);
    const today = cands.filter(x => !x.late), relOK = relays.filter(x => !x.late);
    const delTime = x => x.mode === "direct" || x.mode === "relay" ? x.delT : 1440 + 600;
    const pr = spec.priority || "delivery";
    const score = x => pr === "pickup" ? x.pickT * 4 + x.delta * 0.2 + delTime(x) * 0.05 : pr === "price" ? x.delta + 0.05 * (delTime(x) - ready) : delTime(x) * 3 + x.delta * 0.3 + (spec.to ? 0 : x.pickT);
    const opts = [];
    const push = (x, badge) => { if (!x) return; let o = opts.find(o => o.x === x); if (!o) { o = { x, badges: [] }; opts.push(o); } if (!o.badges.includes(badge)) o.badges.push(badge); };
    const minBy = (L, f) => L.length ? L.reduce((a, b) => f(a) <= f(b) ? a : b) : null;
    const pool = today.concat(relOK);
    push(minBy(pool, score), "Best for you");
    push(minBy(pool, x => x.pickT), "Earliest pickup");
    if (spec.to) push(minBy(pool.filter(x => x.mode !== "depot"), x => x.delT), "Earliest delivery");
    push(minBy(pool, x => x.delta), "Lowest price");
    push(minBy(today.filter(x => x.tags.includes("On the way") || x.tags.some(t => t.startsWith("Next to"))), x => x.km), "Smallest detour");
    push(minBy(today.filter(x => x.tags.includes("On its way back to the depot")), x => x.delta), "Return trip");
    const fast = minBy(pool, x => x.pickT);
    if (fast) push(minBy(pool.filter(x => x.pickT >= fast.pickT + 60), x => x.delta), "Later, cheaper slot");
    push(minBy(relOK, x => x.delT), "Same day via depot · 2 trucks");
    push(minBy(relOK, x => x.delta), "Same day via depot · 2 trucks");
    if (spec.to) push(minBy(today.filter(x => x.mode === "depot"), x => x.delta), "Deliver tomorrow");
    push(minBy(today.filter(x => x.spare), score), "Spare truck");
    if (!pool.some(x => x.mode !== "depot")) push(minBy(cands.concat(relays).filter(x => x.late), x => x.delT), "Misses the deadline");
    const out = opts.map(o => Object.assign(o.x, { badges: o.badges, price: price(o.x) }));
    const distAB = spec.to ? hav(A, spec.to) * 1.3 : hav(A, this.depot) * 1.3;
    const pc = this.cfg.partner, cwt = Math.max(1, spec.w / 100);
    const pcost = pc.base * 1.5 + cwt * (pc.perCwt + pc.perCwtPer100Km * distAB / 100);
    const partner = !this.cfg.partners ? null : { mode: "partner", badges: ["Partner carrier"], delta: pcost, price: Math.round(pcost * 1.25 / 5) * 5, pickT: ready + 120, delT: spec.to ? Math.max(ready + 240, deadline) : null, tags: ["No change to our trucks"], km: 0 };
    let tomorrow = null;
    if (morning) {
      const m = morning.snapshot();
      const J = m.newJob(Object.assign({}, P1, { id: undefined, rdy: null, due: null, f: [] }));
      let best = null;
      for (const r of m.routes) { if (!m.routeEval(r).used) continue; const b = m.bestInsert(r, [J.id]); if (b.delta != null && (!best || b.delta < best.delta)) best = Object.assign(b, { u: r.u }); }
      if (best) { const k = best.seq.indexOf(J.id); tomorrow = { mode: "tomorrow", badges: ["Tomorrow"], delta: best.delta, price: price(best), pickT: best.ev.times[k], delT: null, tags: ["Fits " + m.units[best.u].veh + "'s usual route"], km: 0, veh: m.units[best.u].veh }; }
    }
    const nOne = new Set(cands.map(x => x.u)).size;
    return { T, ready, spec, base, options: out, partner, tomorrow, reasons, whyBy, allBy, ids: { P1: P1.id, P2: P2 && P2.id, D2: D2 && D2.id }, nTrucks: live.length, nOne, nRelay: relays.length, hubs: HUBS };
  };

  // Turn a chosen booking option into a plan.
  P.applyBooking = function (bk, opt) {
    const p = bk.base.snapshot();
    const used = new Set();
    if (opt.mode === "direct" || opt.mode === "depot") { p.setSeq(p.unitRoute(opt.u), opt.seq.slice()); opt.seq.forEach(j => used.add(j)); }
    else if (opt.mode === "partner") { const ids = bk.ids.P2 != null ? [bk.ids.P2, bk.ids.D2] : [bk.ids.P1]; ids.forEach(j => { p.partner.push(j); p.jobs[j].partnerCost = opt.delta / ids.length; used.add(j); }); }
    else if (opt.mode === "tomorrow") { used.add(bk.ids.P1); p.jobs[bk.ids.P1].tomorrow = true; p.tomorrow = (p.tomorrow || []).concat([bk.ids.P1]); }
    else if (opt.mode === "relay") {
      p.jobs[opt.ids.Hb].rdy = opt.rdyB;
      p.setSeq(p.unitRoute(opt.u), opt.seq.slice()); p.setSeq(p.unitRoute(opt.uB), opt.seqB.slice());
      opt.seq.concat(opt.seqB).forEach(j => used.add(j));
    }
    for (const J of p.jobs) if (J.booked && J.o === bk.spec.o && !used.has(J.id) && !p.routes.some(r => r.seq.includes(J.id) || r.done.includes(J.id))) J.ghost = true;
    return p;
  };

  // Put a booked order on one given truck (the dispatcher's live choice). If that truck's planned day is full,
  // move ONE of its other stops to the truck that takes it best, as long as every rule still holds everywhere.
  P.placeOnUnit = function (bk, u, sameDay) {
    const ids = sameDay && bk.ids.P2 != null ? [bk.ids.P2, bk.ids.D2] : [bk.ids.P1];
    const ghosts = p => { for (const J of p.jobs) if (J.booked && J.o === bk.spec.o && !ids.includes(J.id) && !p.routes.some(r => r.seq.includes(J.id) || r.done.includes(J.id))) J.ghost = true; };
    const out = (p, moved) => { ghosts(p); const r = p.unitRoute(u), ev = p.routeEval(r), k = r.seq.indexOf(ids[0]), kd = ids[1] != null ? r.seq.indexOf(ids[1]) : -1;
      return { plan: p, pickT: ev.times[k], delT: kd >= 0 ? ev.times[kd] : null, moved }; };
    const p0 = bk.base.snapshot(), r0 = p0.unitRoute(u);
    if (!r0) return { why: "Truck has no route in the plan" };
    const direct = p0.bestInsert(r0, ids);
    if (direct.delta != null) { p0.setSeq(r0, direct.seq); return out(p0, null); }
    let best = null;
    const seen = new Set();
    for (const j of r0.seq) {
      const g = p0.groupOf(j).filter(x => r0.seq.includes(x));
      const key = g.join(","); if (seen.has(key) || g.some(x => ids.includes(x)) || g.some(x => p0.jobs[x].hub)) continue; seen.add(key);
      const p = bk.base.snapshot(), r = p.unitRoute(u);
      p.setSeq(r, r.seq.filter(x => !g.includes(x)));
      const ins = p.bestInsert(r, ids); if (ins.delta == null) continue;
      p.setSeq(r, ins.seq);
      let to = null;
      for (const r2 of p.routes) { if (r2.u === u || p.units[r2.u].down) continue; const b = p.bestInsert(r2, g); if (b.delta != null && (!to || b.delta < to.delta)) to = Object.assign(b, { r: r2 }); }
      if (!to) continue;
      const cost = ins.delta + to.delta;
      if (!best || cost < best.cost) best = { cost, p, to, g };
    }
    if (!best) return { why: direct.why || "No room, even after moving one stop" };
    best.p.setSeq(best.to.r, best.to.seq);
    const J = best.p.jobs[best.g[0]];
    return out(best.p, { c: J.c, city: J.city, toVeh: best.p.units[best.to.r.u].veh, n: best.g.length });
  };

  // Dispatcher moves a stop (with its pickup/delivery pair) to another truck by hand: same hard rules, shown before it's applied.
  P.moveTo = function (j, u, T) {
    const base = this.snapshot(); base.freezeAt(T);
    const r = base.routes.find(rr => rr.seq.includes(j));
    if (!r) return { err: "That stop is already done at " + fmtT(T) + " or isn't on a truck." };
    if (r.u === u) return { err: "It's already on that truck." };
    const p = base.snapshot(); const from = p.unitRoute(r.u), to = p.unitRoute(u);
    const g = p.groupOf(j).filter(x => from.seq.includes(x));
    if (!to) return { err: "That truck has no route today." };
    const b = p.bestInsert(to, g);
    if (b.why) return { err: p.units[u].veh + " can't take it: " + b.why };
    p.setSeq(from, from.seq.filter(x => !g.includes(x)));
    p.setSeq(to, b.seq);
    const keep = base.snapshot();
    const opts = rank([scenarioResult("Move to " + p.units[u].veh, p, ["Same checks as the plan: room, equipment, licence, hours, every other stop's promise"]),
                       scenarioResult("Keep it on " + base.units[r.u].veh, keep, ["The plan as it is"])]);
    return { title: "Move " + p.jobs[j].c + " to " + p.units[u].veh, base, options: opts, affected: [j], manual: true };
  };

  P.cancel = function (j, T) {
    const base = this.snapshot(); base.freezeAt(T);
    const r = base.routes.find(rr => rr.seq.includes(j));
    if (!r) return null;
    const p = base.snapshot(); const rr = p.unitRoute(r.u);
    const g = p.groupOf(j).filter(x => rr.seq.includes(x));
    p.setSeq(rr, rr.seq.filter(x => !g.includes(x))); p.jobs[j].cancelled = true;
    p.improve(400);
    return { title: "Order cancelled: " + p.jobs[j].c, base, options: rank([scenarioResult("Remove and re-sequence", p, ["Frees " + fmtN(p.jobs[j].w) + " lb on " + p.units[r.u].veh])]), affected: [j] };
  };

  function rank(options) {
    options.forEach(o => { o.score = o.kpi.cost + o.kpi.nLate * 40 + o.kpi.nUnserved * 500 + (o.kpi.partnerRisk ? 150 : 0); });
    options.forEach(o => { if (!isFinite(o.score)) o.score = 1e12; });
    const best = Math.min(...options.map(o => o.score));
    options.forEach(o => o.best = o.score === best);
    return options;
  }

  const Engine = { Planner, DEFAULTS, hav, fmtT, fmtN };
  if (typeof module !== "undefined") module.exports = Engine; else root.Engine = Engine;
})(this);
