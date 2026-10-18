import { useEffect, useMemo, useState } from "react";
import { get, post, useFetch, useLive } from "../../shared/api.js";
import { fmtT, fmtN, fmtDur, kmTxt, STATUS, fmtDay } from "../../shared/fmt.js";
import LiveMap from "../../shared/LiveMap.jsx";
import OrderPanel from "./OrderPanel.jsx";
import TruckPanel from "./TruckPanel.jsx";
import Overview from "./Overview.jsx";
import Compare from "./Compare.jsx";
import Prefs from "../../shared/Prefs.jsx";
import AudienceQR from "./AudienceQR.jsx";

export default function Dispatch() {
  const { snap, online } = useLive();
  const [meta] = useFetch("/api/meta", 0, 600000);
  const [tab, setTab] = useState("new");
  const [sel, setSel] = useState(null);          // {type:"order", pid} | {type:"truck", u}
  const [hl, setHl] = useState(null);            // option card the dispatcher tapped: show that truck on the map
  useEffect(() => { setHl(null); }, [sel?.type, sel?.pid, sel?.u]);
  const [toast, setToast] = useState(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState("live");
  const [qr, setQr] = useState(false);
  const [days, setDays] = useState(null);
  useEffect(() => { get("/api/days").then(setDays).catch(() => {}); }, []);
  const pickDay = d => post("/api/day", { day: d }).then(r => { if (r.ok) { setSel(null); flash(`Now replaying ${fmtDay(d)} at 11:20.`); } else flash(r.why); }).catch(e => flash(e.message));
  const [seen, setSeen] = useState(() => new Set());
  const [settings, setSettings] = useFetch("/api/settings", 0, 60000);
  const costOn = settings?.rank_mode === "cost";
  const toggleCost = () => post("/api/settings", { rank_mode: costOn ? "time" : "cost" }).then(setSettings).catch(e => flash(e.message));

  const T = snap ? snap.clock.T : null;
  const minute = T == null ? 0 : Math.floor(T);
  const trig = `${minute}|${snap ? snap.last_event : 0}`;
  const [orders] = useFetch("/api/orders", trig, 8000);
  const [warnings] = useFetch("/api/warnings", trig, 8000);
  const [gaps] = useFetch(tab === "orders" || tab === "new" ? "/api/gaps" : null, Math.floor(minute / 2) + "|" + (snap ? snap.last_event : 0), 15000);
  const [events] = useFetch("/api/events", snap ? snap.last_event : 0, 10000);
  const [trucks] = useFetch(tab === "trucks" ? "/api/trucks" : null, trig, 8000);

  const names = useMemo(() => { const n = {}; (meta?.trucks || []).forEach(t => (n[t.u] = t.veh)); return n; }, [meta]);
  const gapBy = useMemo(() => { const g = {}; (gaps || []).forEach(x => (g[x.pid] = x)); return g; }, [gaps]);

  const flash = m => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const clock = (action, value) => post("/api/clock", { action, value }).catch(e => flash(e.message));

  // keyboard: space = play/pause
  useEffect(() => {
    const k = e => { if (e.code === "Space" && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); snap && clock(snap.clock.playing ? "pause" : "play"); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [snap]);

  const tierRank = { regular: 0, occasional: 1, new: 2 };
  const waiting = (orders || []).filter(o => o.status === "waiting").sort((a, b) => (tierRank[a.tier] - tierRank[b.tier]) || (b.waiting_min - a.waiting_min));
  // New orders tab: entered in Elite in the last 60 min and still without a truck. Opening one does NOT remove it;
  // it stays here (marked "opened") until it is assigned. The bell counts the ones not opened yet.
  const newList = (orders || []).filter(o => o.status === "waiting" && T != null && o.known >= T - 60).sort((a, b) => b.known - a.known);
  const fresh = newList.filter(o => !seen.has(o.pid));
  const freshIds = fresh.map(o => o.pid).join(",");
  const [announced, setAnnounced] = useState(() => new Set());
  useEffect(() => {
    const novel = fresh.filter(o => !announced.has(o.pid));
    if (!novel.length) return;
    setAnnounced(a => { const n = new Set(a); novel.forEach(o => n.add(o.pid)); return n; });
    if (announced.size || novel.length < 5) flash(novel.length === 1 ? `New order in Elite: ${novel[0].a} (${novel[0].svc_label})` : `${novel.length} new orders in Elite`);
  }, [freshIds]);
  const freshSet = new Set(fresh.map(o => o.pid));
  const mine = (orders || []).filter(o => o.by === "us");
  const phone = (orders || []).filter(o => o.by === "phone");
  const longest = waiting[0];

  // map content
  const [opts] = useFetch(sel?.type === "order" ? `/api/orders/${sel.pid}/options` : null, trig, 8000);
  const [truck] = useFetch(sel?.type === "truck" ? `/api/trucks/${sel.u}` : null, trig, 8000);
  const mapState = useMemo(() => {
    const pins = [];
    if (meta) pins.push({ id: "depot", kind: "depot", lat: meta.depot.lat, lng: meta.depot.lng, label: "Trans Ontario depot" });
    for (const o of waiting) pins.push({ id: "o" + o.pid, pid: o.pid, kind: "order", lat: o.lat, lng: o.lng, label: `${o.a} · waiting ${fmtDur(o.waiting_min)}`, hot: sel?.type === "order" && sel.pid === o.pid });
    let lines = [], focus = null, fitPts = null, fitKey = null;
    if (sel?.type === "order" && opts && opts.order.pid === sel.pid) {
      const o = opts.order;
      if (!waiting.some(w => w.pid === o.pid)) pins.push({ id: "sel", kind: "order", lat: o.lat, lng: o.lng, label: o.a, hot: true });
      const dp = o.drop && o.drop.lat != null ? o.drop : (o.dest && o.dest.lat != null ? { lat: o.dest.lat, lng: o.dest.lng, a: [o.dest.a, o.dest.city].filter(Boolean).join(", ") } : null);
      if (dp) pins.push({ id: "selDrop", kind: "drop", lat: dp.lat, lng: dp.lng, label: `Drop-off · ${dp.a}${o.drop ? " (same day)" : " (next business day, via depot)"}` });
      const on = hl != null && opts.ok.some(x => x.u === hl) ? hl : (opts.ok[0] || {}).u;
      const shown = opts.ok.slice(0, 3).concat(opts.ok.filter(x => x.u === on && opts.ok.indexOf(x) >= 3));
      focus = shown.map(x => x.u);
      const live = Object.fromEntries((snap?.trucks || []).map(t => [t[0], t]));
      shown.forEach(x => {
        const p = live[x.u]; if (!p) return;
        const me = x.u === on;
        lines.push({ pts: [[p[1], p[2]], [x.from.lat, x.from.lng], [o.lat, o.lng]], color: me ? "var(--accent)" : "var(--muted)", dash: me ? null : "6 6", weight: me ? 4 : 2.5 });
      });
      fitPts = hl != null && live[on] ? [[o.lat, o.lng], [live[on][1], live[on][2]]] : [[o.lat, o.lng]].concat(focus.map(u => live[u]).filter(Boolean).map(p => [p[1], p[2]]));
      if (dp) fitPts.push([dp.lat, dp.lng]);
      fitKey = "o" + sel.pid + "-" + (hl ?? "");
    }
    if (sel?.type === "truck" && truck && truck.u === sel.u) {
      focus = [sel.u];
      const ahead = truck.plan.filter(s => !s.done);
      lines.push({ pts: [[truck.lat, truck.lng]].concat(ahead.map(s => [s.lat, s.lng])), color: "var(--accent)", weight: 4 });
      ahead.filter(s => s.k === "P" || s.k === "D").forEach(s => pins.push({ id: "s" + s.j, kind: s.k === "P" ? "pickup" : "drop", lat: s.lat, lng: s.lng, label: `${fmtT(s.arr)} · ${s.k === "P" ? "pickup" : "delivery"} · ${s.a}${s.ins ? " (added by dispatcher)" : ""}` }));
      fitPts = [[truck.lat, truck.lng]].concat(ahead.map(s => [s.lat, s.lng]));
      fitKey = "t" + sel.u;
    }
    return { pins, lines, focus, fitPts, fitKey };
  }, [meta, orders, sel, opts, truck, snap, hl]);

  const pick = s => { setSel(s); if (s && s.type === "order") setSeen(x => { const n = new Set(x); n.add(s.pid); return n; }); };
  const filt = list => (q ? list.filter(o => (o.a + " " + o.ordno + " " + (o.c || "") + " " + (o.city || "")).toLowerCase().includes(q.toLowerCase())) : list);

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><img src="/logo.png" alt="Trans Ontario Express" /><div className="prod">Live Dispatch<small>Prototype</small></div></div>
        <div className="seg" role="group" aria-label="View">
          <button aria-pressed={view === "live"} onClick={() => setView("live")}>Live dispatch</button>
          <button aria-pressed={view === "compare"} onClick={() => setView("compare")}>Manual vs our system</button>
        </div>
        <button className={"btn small" + (costOn ? " primary" : "")} onClick={toggleCost} aria-pressed={costOn} title="Show an illustrative $ score and rank by it. Off: rank by on-time, wait, extra driving time and km only.">{costOn ? "Cost: on" : "Cost: off"}</button>
        <button className="btn small" onClick={() => setQr(true)} title="Let people in the room book a pickup from their phone">📱 Audience QR</button>
        <a className="btn small" href="/plan" target="_blank" rel="noreferrer" title="Whole-day plan, morning problems and what-if disruptions">Plan the day ↗</a>
        <a className="btn small" href="/elite" target="_blank" rel="noreferrer">Elite desk ↗</a>
        <button className={"btn small" + (fresh.length ? " primary" : "")} onClick={() => { setView("live"); setTab("new"); }} aria-label={`${fresh.length} new orders not opened yet`}>🔔 {fresh.length} new</button>
        <Prefs />
        <span className="muted" title={online ? "Connected to the backend" : "Reconnecting…"}><span className={"dot" + (online ? "" : " off")} /> {online ? "Live" : "Offline"}</span>
        {snap && (
          <div className="clock" aria-label="Replay clock">
            {days && days.days.length > 1
              ? <select value={snap.clock.day} onChange={e => pickDay(e.target.value)} aria-label="Real day to replay" title="Replay any real day from the routing report">
                  {days.days.map(d => <option key={d.day} value={d.day}>{fmtDay(d.day)} · {d.trucks} trucks</option>)}
                </select>
              : <span className="src">{fmtDay(snap.clock.day)} replay<br />stands in for Samsara</span>}
            <span className="t">{snap.clock.label}</span>
            <button className="btn small" onClick={() => clock(snap.clock.playing ? "pause" : "play")}>{snap.clock.playing ? "❚❚ Pause" : "▶ Play"}</button>
            <select value={snap.clock.speed} onChange={e => clock("speed", +e.target.value)} aria-label="Replay speed">
              {[1, 10, 30, 60, 120].map(s => <option key={s} value={s}>{s}×</option>)}
            </select>
            <input type="time" value={snap.clock.label} onChange={e => { const [h, m] = e.target.value.split(":").map(Number); if (!isNaN(h)) clock("jump", h * 60 + m); }} aria-label="Jump to time" />
            <button className="btn small ghost" title="Back to the real day at 11:20: clears bookings, decisions and driver reports" onClick={() => post("/api/reset").then(() => { setSel(null); flash(`Reset to the real ${fmtDay(snap.clock.day)} at 11:20.`); }).catch(e => flash(e.message))}>Reset</button>
          </div>
        )}
      </header>

      {view === "compare" && <Compare key={costOn ? "c" : "t"} T={T} onOpen={(pid, t) => { clock("jump", t); setView("live"); setTab("orders"); setSel({ type: "order", pid }); }} />}
      {view === "live" && <>
      <section className="kpis">
        <div className="kpi"><div className="lab">Waiting for a truck</div><div className="v">{waiting.length}</div><div className="s">{longest ? `Longest: ${longest.a}, ${fmtDur(longest.waiting_min)}` : "None"}</div></div>
        <div className="kpi"><div className="lab">Trucks on the road</div><div className="v">{snap ? snap.counts.on_road : "—"}<span className="muted" style={{ fontSize: 14 }}> / {meta?.trucks.length || "—"}</span></div><div className="s">{snap?.counts.down ? `${snap.counts.down} broken down` : "Positions from Samsara"}</div></div>
        <div className="kpi"><div className="lab">Warnings</div><div className={"v" + ((warnings || []).length ? " warnc" : "")}>{(warnings || []).length}</div><div className="s">{(warnings || [])[0]?.txt || "All clear"}</div></div>
        <div className="kpi"><div className="lab">Assigned by you</div><div className="v">{mine.length}</div><div className="s">{phone.length} by phone so far (real history)</div></div>
      </section>

      <div className="main">
        <aside className="side">
          <div className="tabs" role="tablist">
            {[["new", "New", newList.length, fresh.length > 0], ["orders", "Orders", waiting.length, waiting.length > 0], ["trucks", "Trucks", null], ["warnings", "Alerts", (warnings || []).length, (warnings || []).length > 0], ["log", "Sync", null]].map(([k, l, n, hot]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}{n != null && <span className={"n" + (hot ? (k === "new" ? " new" : " hot") : "")}>{n}</span>}</button>
            ))}
          </div>
          {(tab === "orders" || tab === "trucks" || tab === "new") && <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)" }}><input type="search" placeholder={tab !== "trucks" ? "Search order, address, customer…" : "Search truck or driver…"} value={q} onChange={e => setQ(e.target.value)} /></div>}
          <div className="list">
            {tab === "new" && <>
              <div className="grp" style={{ color: "var(--accent)" }}><span>New orders received · last hour, no truck yet</span><span className="chip acc">{newList.length}</span></div>
              {orders && !newList.length && <div className="empty">No new orders right now. They appear here the moment they are saved in Elite, and stay until they get a truck.</div>}
              {filt(newList).map(o => <OrderRow key={"n" + o.pid} o={o} gap={gapBy[o.pid]} isNew opened={seen.has(o.pid)} sel={sel?.type === "order" && sel.pid === o.pid} onClick={() => pick({ type: "order", pid: o.pid })} />)}
            </>}
            {tab === "orders" && <>
              <div className="grp"><span>From Elite · waiting for a truck</span><span>{waiting.length}</span></div>
              {!orders && <div className="empty">Loading orders…</div>}
              {orders && !waiting.length && <div className="empty">No pickups waiting.</div>}
              {filt(waiting).map(o => <OrderRow key={o.pid} o={o} gap={gapBy[o.pid]} isNew={freshSet.has(o.pid)} sel={sel?.type === "order" && sel.pid === o.pid} onClick={() => pick({ type: "order", pid: o.pid })} />)}
              {mine.length > 0 && <div className="grp"><span>Assigned by you</span><span>{mine.length}</span></div>}
              {filt(mine).map(o => <OrderRow key={o.pid} o={o} sel={sel?.type === "order" && sel.pid === o.pid} onClick={() => pick({ type: "order", pid: o.pid })} />)}
              {phone.length > 0 && <details><summary className="grp" style={{ cursor: "pointer" }}><span>Assigned by phone (real history)</span><span>{phone.length}</span></summary>
                {filt(phone).map(o => <OrderRow key={o.pid} o={o} sel={sel?.type === "order" && sel.pid === o.pid} onClick={() => pick({ type: "order", pid: o.pid })} />)}</details>}
            </>}
            {tab === "trucks" && <>
              {!trucks && <div className="empty">Loading trucks…</div>}
              {(trucks || []).filter(t => !q || (t.veh + " " + t.name + " " + t.code).toLowerCase().includes(q.toLowerCase()))
                .sort((a, b) => ({ down: 0, held: 0, moving: 1, stop: 1, home: 2, before: 3, done: 4 }[a.status] - { down: 0, held: 0, moving: 1, stop: 1, home: 2, before: 3, done: 4 }[b.status]))
                .map(t => (
                  <div key={t.u} className={"row" + (sel?.type === "truck" && sel.u === t.u ? " sel" : "")} onClick={() => pick({ type: "truck", u: t.u })}>
                    <div className="l1"><span className="t1">{t.veh} <span className="muted" style={{ fontWeight: 500 }}>· {t.name}</span></span><span className={"chip" + (t.status === "down" ? " crit" : "")}>{STATUS[t.status]}</span></div>
                    <div className="t2">{t.label}</div>
                    {(t.status === "moving" || t.status === "stop") && <div className="meter"><div className="bar"><i className={t.fill >= .9 ? "full" : t.fill >= .7 ? "hi" : ""} style={{ width: Math.min(100, t.fill * 100) + "%" }} /></div>
                      <div className="t2">{fmtN(t.free_w)} lb · {t.free_sp.toFixed(1)} spots free{t.est ? " (est.)" : ""}{t.tap ? " · driver confirmed" : ""}</div></div>}
                  </div>
                ))}
            </>}
            {tab === "warnings" && <>
              {!(warnings || []).length && <div className="empty">No warnings right now.</div>}
              {(warnings || []).map((w, i) => (
                <div key={i} className={"wrow " + w.lvl} onClick={() => w.pid != null ? pick({ type: "order", pid: w.pid }) : w.u != null && pick({ type: "truck", u: w.u })}><i /><span>{w.txt}</span></div>
              ))}
            </>}
            {tab === "log" && <>
              <div className="grp"><span>What we sent to Elite and Samsara</span></div>
              {(events || []).slice().reverse().map(e => (
                <div key={e.id} className={"ev " + e.kind}><span className="mono muted">{fmtT(e.T)}</span><div><div className="k">{{ sync: "Sync", assign: "Decision", alert: "Alert", driver: "Driver", order: "New order", system: "System" }[e.kind] || e.kind}</div>{e.text}</div></div>
              ))}
              {!(events || []).length && <div className="empty">Nothing yet. Assign a pickup and every write-back to Elite and Samsara shows here.</div>}
            </>}
          </div>
        </aside>

        <div className="mapwrap">
          <LiveMap trucks={snap?.trucks || []} names={names} pins={mapState.pins} lines={mapState.lines} focus={mapState.focus}
            fitKey={mapState.fitKey} fitPts={mapState.fitPts}
            onTruck={u => pick({ type: "truck", u })} onPin={p => p.pid != null && pick({ type: "order", pid: p.pid })} />
          <div className="legend">
            <span><i style={{ background: "var(--ok)" }} />Truck, room on board</span>
            <span><i style={{ background: "var(--warn)" }} />Truck 70–90% full</span>
            <span><i style={{ background: "var(--crit)" }} />Truck full or broken down</span>
            <span><i style={{ background: "var(--surface)", borderStyle: "dashed" }} />Position from driver's phone</span>
            <span><svg width="12" height="14" viewBox="0 0 18 24"><path d="M9 23 C9 23 1 13.5 1 8.5 A8 8 0 0 1 17 8.5 C17 13.5 9 23 9 23Z" fill="var(--warn)" /></svg>Pickup waiting for a truck</span>
            {sel?.type === "order" && <span><svg width="12" height="14" viewBox="0 0 18 24"><path d="M9 23 C9 23 1 13.5 1 8.5 A8 8 0 0 1 17 8.5 C17 13.5 9 23 9 23Z" fill="var(--ok)" /></svg>Drop-off of the selected order</span>}
          </div>
        </div>

        <aside className="detail">
          {sel?.type === "order" && <OrderPanel pid={sel.pid} data={opts} names={names} T={T} hl={hl} onHighlight={setHl} onClose={() => setSel(null)} onTruck={u => pick({ type: "truck", u })} flash={flash} />}
          {sel?.type === "truck" && <TruckPanel u={sel.u} t={truck} T={T} onClose={() => setSel(null)} onOrder={pid => pick({ type: "order", pid })} flash={flash} />}
          {!sel && <Overview gaps={gaps} waiting={waiting} onOrder={pid => pick({ type: "order", pid })} flash={flash} costOn={costOn} />}
        </aside>
      </div>
      </>}
      {toast && <div className="toast" role="status">{toast}</div>}
      {qr && <AudienceQR onClose={() => setQr(false)} />}
    </div>
  );
}

export function SvcChip({ o }) {
  const hot = ["RUSH", "RUSH90", "EXPEDITE", "SAME DAY"].includes(o.svc);
  return <span className={"chip" + (hot ? " crit" : "")} title={`Must be picked up by ${fmtT(o.pickup_by)}`}>{o.svc_label} · by {fmtT(o.pickup_by)}</span>;
}

export function TierChip({ o }) {
  if (o.tier === "regular") return <span className="chip acc" title={`${o.past} orders on the earlier days in the report`}>Regular customer</span>;
  if (o.tier === "new") return <span className="chip" title="No earlier orders from this customer">New customer</span>;
  return null;
}

function OrderRow({ o, gap, sel, onClick, isNew, opened }) {
  const long = o.status === "waiting" && o.waiting_min > 120;
  return (
    <div className={"row" + (sel ? " sel" : "") + (o.status === "waiting" ? " waiting" : "") + (long ? " long" : "")} onClick={onClick}>
      <div className="l1"><span className="t1">{o.a}</span>
        {o.status === "waiting" ? <span className={"chip " + (long ? "crit" : "warn")}>{fmtDur(o.waiting_min)}</span>
          : <span className="chip acc">{o.truck}</span>}</div>
      {isNew && <div className="t2" style={{ color: opened ? "var(--muted)" : "var(--accent)", fontWeight: 700 }}>{opened ? "Opened" : "NEW"} · entered {fmtT(o.known)} · {o.audience ? "📱 audience" : o.channel || "Elite"}</div>}
      <div className="t2"><SvcChip o={o} /> <TierChip o={o} /> #{o.ordno} · {o.city || ""} · {fmtN(o.w)} lb · {o.sp} spot{o.sp === 1 ? "" : "s"}{o.se ? " (est.)" : ""}{o.src === "booking" ? " · entered at the desk" : ""}</div>
      {o.drop && <div className="t2">→ delivers today to {o.drop.a}</div>}
      {o.status !== "waiting" && <div className="t2">{o.by === "us" ? "Pickup planned " : "Picked up "}{fmtT(o.pickup_at)}</div>}
      {gap && <div className="hint">↳ {gap.veh} passes by: +{kmTxt(gap.km)}</div>}
    </div>
  );
}
