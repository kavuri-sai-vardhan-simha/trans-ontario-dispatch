import { useEffect, useMemo, useState } from "react";
import { get, post, useFetch, useLive } from "../../shared/api.js";
import { fmtT, fmtN, fmtDay } from "../../shared/fmt.js";
import Prefs from "../../shared/Prefs.jsx";

/* Elite order desk (simulator). Stand-in for Trans Ontario's order system so the prototype can show a full day:
   - left: orders entering Elite at their real Sep 29 times (and any typed here)
   - right: what office staff type into Elite when a phone call or email comes in.
   In production nothing is typed twice: our layer reads new orders from Elite automatically. */
export default function Elite() {
  const { snap } = useLive();
  const T = snap ? snap.clock.T : null;
  const [feed] = useFetch("/api/elite/feed?limit=60", T == null ? 0 : Math.floor(T) + "|" + (snap ? snap.last_event : 0), 6000);
  const [last, setLast] = useState(null);
  const [cmsg, setCmsg] = useState(null);
  const cancel = async o => {
    if (!confirmCancel(o)) return;
    try { const r = await post(`/api/orders/${o.pid}/cancel`); setCmsg(r.ok ? `Order ${o.ordno} cancelled in Elite. The dispatcher and the driver are told; the truck's room is freed.` : r.why); } catch (e) { setCmsg(e.message); }
  };
  return (
    <div className="bk">
      <div className="bk-top">
        <div className="in" style={{ maxWidth: 1200 }}>
          <div className="row1" style={{ paddingBottom: 12 }}>
            <img src="/logo.png" alt="Trans Ontario Express" />
            <b style={{ fontSize: 16 }}>Elite order desk</b><span style={{ opacity: .85, fontSize: 12 }}>simulator</span>
            <span style={{ marginLeft: "auto" }}><Prefs onDark /></span>
            <span className="clk" style={{ marginLeft: 0 }}>{snap ? fmtDay(snap.clock.day) : ""} (replay)<br /><b>{snap ? snap.clock.label : "—"}</b></span>
          </div>
        </div>
      </div>
      <div className="desk">
        <section className="bk-sec" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 14px 6px" }}>
            <h3>Orders in Elite, as they came in</h3>
            <p className="note">Real orders of the day appear at the time they were entered. Each one lands on the dispatcher's screen as a new order. A customer calling to cancel: press Cancel order.</p>
            {cmsg && <p className="ok" style={{ fontWeight: 700, fontSize: 12.5 }}>{cmsg}</p>}
          </div>
          <div className="feed">
            {!feed && <span className="note" style={{ padding: 14 }}>Loading…</span>}
            {(feed || []).map(o => (
              <div key={o.pid} className="fr" style={last === o.ordno ? { background: "var(--accent-soft)" } : null}>
                <span className="t">{o.entered != null && o.entered > 420 ? fmtT(o.entered) : "< 7:00"}</span>
                <span>
                  <b>{o.a}</b>
                  <div className="note">#{o.ordno} · {o.svc_label} · {fmtN(o.w)} lb · {o.sp} skid{o.sp === 1 ? "" : "s"} · {o.channel || "Entered by staff (phone/email)"}</div>
                  {o.status !== "cancelled" && <div className="note" style={{ fontWeight: 600 }}>{o.truck ? `Truck: ${o.truck}${o.status === "picked" ? " · picked up" : ""}` : o.status === "waiting" ? "Waiting for a truck" : ""}</div>}
                </span>
                <span style={{ display: "grid", gap: 4, justifyItems: "end" }}>
                  <span className={"chip " + (o.tier === "regular" ? "acc" : "")} title={`${o.past} orders on the earlier days in the report`}>{o.tier === "regular" ? "Regular" : o.tier === "occasional" ? "Occasional" : "New"}</span>
                  {o.status === "cancelled" ? <span className="chip crit">Cancelled</span>
                    : o.status !== "picked" && <button className="btn small" onClick={() => cancel(o)} title="Customer called to cancel">Cancel order</button>}
                </span>
              </div>
            ))}
          </div>
        </section>
        <main className="bk-main"><EntryForm T={T} onDone={setLast} /></main>
      </div>
    </div>
  );
}

// Two-step cancel without a browser dialog: first click arms, second click (within 4 s) cancels
let armed = null;
function confirmCancel(o) {
  if (armed && armed.pid === o.pid && Date.now() - armed.at < 4000) { armed = null; return true; }
  armed = { pid: o.pid, at: Date.now() };
  alertBar(`Press "Cancel order" again to cancel ${o.ordno}.`);
  return false;
}
function alertBar(text) {
  let el = document.getElementById("cancel-hint");
  if (!el) { el = document.createElement("div"); el.id = "cancel-hint"; el.setAttribute("role", "status");
    el.style.cssText = "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 14px;border-radius:10px;font-size:13px;z-index:50";
    document.body.appendChild(el); }
  el.textContent = text; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 4000);
}

function AddressPicker({ label, places, value, onChange }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    if (!places) return [];
    const t = q.trim().toLowerCase();
    return (t ? places.filter(p => (p.a + " " + p.city).toLowerCase().includes(t)) : places).slice(0, 6);
  }, [places, q]);
  if (value) return (
    <div className="addr-pick"><span className="lab">{label}</span>
      <div className="addr-sel"><span><b>{value.a}</b><small className="muted">{value.city}</small></span><button className="btn small" onClick={() => onChange(null)}>Change</button></div>
    </div>
  );
  return (
    <div className="addr-pick">
      <label className="f">{label}<input type="search" placeholder="Type a street or city (real customer addresses)" value={q} onChange={e => setQ(e.target.value)} /></label>
      <div className="addr-list">
        {list.map(p => <button key={p.a} onClick={() => onChange(p)}>{p.a}<small>{p.city}</small></button>)}
        {places && !list.length && <span className="note" style={{ padding: 10 }}>No match. The prototype knows the 1,398 customer addresses in the routing report.</span>}
      </div>
    </div>
  );
}

function EntryForm({ T, onDone }) {
  const [places] = useFetch("/api/places", 0, 600000);
  const [svc] = useFetch("/api/services", T == null ? 0 : Math.floor(T), 15000);
  const [f, setF] = useState({ channel: "Phone", contact: "", company: "", consignee: "", service: "OVERNIGHT", pieces: 1, spots: "", weight: "", equipment: "TRUCK", tailgate: false, ref: "", L: "", W: "", H: "", stackable: false, tdg: false });
  const [from, setFrom] = useState(null), [to, setTo] = useState(null);
  const [who, setWho] = useState(null);
  const [msg, setMsg] = useState(null), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const services = svc ? Object.entries(svc.services) : [];
  const cur = svc && svc.services[f.service];
  useEffect(() => { if (svc && cur && !cur.open) { const open = services.find(([, v]) => v.open); if (open) set("service", open[0]); } }, [svc]);
  // who is calling? looked up from the phone/email, nobody is asked
  useEffect(() => {
    if (!f.contact.trim()) { setWho(null); return; }
    const id = setTimeout(() => get(`/api/customers/lookup?contact=${encodeURIComponent(f.contact)}`).then(setWho).catch(() => {}), 300);
    return () => clearTimeout(id);
  }, [f.contact]);

  // skid spots from the size, if given (48 x 40 in = one spot; stackable up to 48 in goes two high; dangerous goods never stacked)
  const sized = (+f.L > 0 && +f.W > 0) ? (() => {
    let per = Math.ceil((+f.L * +f.W) / (48 * 40) * 4) / 4, tot = per * Math.max(1, +f.pieces || 1);
    const two = f.stackable && !f.tdg && +f.H > 0 && +f.H <= 48;
    if (two) tot = Math.ceil(tot / 2 * 4) / 4;
    return { sp: Math.max(0.25, tot), two };
  })() : null;
  const missing = [];
  if (!f.contact.trim()) missing.push("caller's phone or email");
  if (!f.company.trim()) missing.push("shipper name");
  if (!from) missing.push("pickup address");
  if (!to) missing.push("delivery address");
  if (!(+f.spots > 0) && !sized) missing.push("skid spots (or the size)");
  if (!(+f.weight > 0)) missing.push("weight");
  if (!cur || !cur.open) missing.push("an open service");

  const submit = async () => {
    if (missing.length) { setErr("Please add " + missing.join(", ") + "."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await post("/api/bookings", {
        channel: f.channel === "Email" ? "Email (entered in Elite)" : "Phone (entered in Elite)", contact: f.contact, service: f.service,
        shipper: { name: f.company.trim(), address: from.a, city: from.city, lat: from.lat, lng: from.lng },
        consignee: { name: f.consignee.trim() || "Receiver", address: to.a, city: to.city, lat: to.lat, lng: to.lng },
        pieces: +f.pieces || 1, piece_type: "SKD", weight: +f.weight, spots: sized ? sized.sp : +f.spots, equipment: f.equipment, tailgate: f.tailgate, ref: f.ref,
        length: +f.L || null, width: +f.W || null, height: +f.H || null, stackable: f.stackable, tdg: f.tdg,
      });
      if (!r.ok) { setErr(r.why); setBusy(false); return; }
      setMsg(`Order ${r.ordno} saved in Elite. It is now on the dispatcher's screen under New orders.`); onDone(r.ordno);
      setF(x => ({ ...x, contact: "", company: "", consignee: "", spots: "", weight: "", ref: "", L: "", W: "", H: "", stackable: false, tdg: false })); setFrom(null); setTo(null);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <>
      <div className="banner">Stand-in for Elite. In production, orders are read from Elite automatically: nobody types anything twice.</div>
      {msg && <div className="bk-sec"><span className="ok" style={{ fontWeight: 700 }}>{msg}</span></div>}
      <section className="bk-sec">
        <h3>New order from a phone call or email</h3>
        <div className="g2">
          <label className="f">Came in by
            <select value={f.channel} onChange={e => set("channel", e.target.value)}><option>Phone</option><option>Email</option></select>
          </label>
          <label className="f">Caller's phone or email<input type="text" value={f.contact} onChange={e => set("contact", e.target.value)} placeholder="e.g. 416-555-0101" /></label>
        </div>
        {who && <div className="who">
          {who.found ? <><span className={"chip " + (who.tier === "regular" ? "acc" : "")}>{who.tier === "regular" ? "Regular customer" : who.tier === "occasional" ? "Occasional customer" : "New customer"}</span>
            <span className="muted">{who.past} earlier orders · found by {who.how}</span></>
            : <><span className="chip">New customer</span><span className="muted">No earlier orders for this phone/email. Remembered after this order.</span></>}
        </div>}
        <label className="f">Shipper name<input type="text" value={f.company} onChange={e => set("company", e.target.value)} /></label>
        <AddressPicker label="Pickup address" places={places} value={from} onChange={setFrom} />
        <label className="f">Receiver name<input type="text" value={f.consignee} onChange={e => set("consignee", e.target.value)} /></label>
        <AddressPicker label="Delivery address" places={places} value={to} onChange={setTo} />
      </section>

      <section className="bk-sec">
        <h3>Service</h3>
        <div className="svc">
          {services.map(([code, v]) => (
            <button key={code} aria-pressed={f.service === code} disabled={!v.open} onClick={() => set("service", code)}>
              <span className="l1"><span>{v.label}</span><span className={v.open ? "ok" : "crit"} style={{ fontSize: 12 }}>{v.open ? (f.service === code ? "Selected" : "Open") : "Closed"}</span></span>
              <span className="rule">{code === "RUSH" ? "Pickup before 3:30 pm · delivered today" : code === "SAME DAY" ? "Order by 12 pm · pickup before 5 pm · delivered by 5 pm" : code === "OVERNIGHT" ? "Order by 3:30 pm · pickup before 5 pm · delivered next business day" : code === "AFTER HOURS" ? "After 4 pm, called in" : "Pickup before 1:30 pm"}</span>
              {!v.open && <span className="why">{v.why}</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="bk-sec">
        <h3>Freight</h3>
        <div className="g3">
          <label className="f">Pieces<input type="number" min="1" value={f.pieces} onChange={e => set("pieces", e.target.value)} /></label>
          <label className="f">Skid spots<small>{sized ? "from the size" : "required, or give the size"}</small><input type="number" min="0.25" step="0.25" value={sized ? sized.sp : f.spots} disabled={!!sized} onChange={e => set("spots", e.target.value)} /></label>
          <label className="f">Weight (lb)<input type="number" min="1" value={f.weight} onChange={e => set("weight", e.target.value)} /></label>
        </div>
        <label className="f">Truck needed
          <select value={f.equipment} onChange={e => set("equipment", e.target.value)}>
            <option value="TRUCK">Any truck (12 skids / 15,000 lb straight truck is fine)</option>
            <option value="53FT">53' trailer (up to 26 skids / 44,000 lb)</option>
          </select>
        </label>
        <div className="g3">
          <label className="f">Length (in)<small>per piece, optional</small><input type="number" min="1" value={f.L} onChange={e => set("L", e.target.value)} placeholder="48" /></label>
          <label className="f">Width (in)<small>&nbsp;</small><input type="number" min="1" value={f.W} onChange={e => set("W", e.target.value)} placeholder="40" /></label>
          <label className="f">Height (in)<small>&nbsp;</small><input type="number" min="1" value={f.H} onChange={e => set("H", e.target.value)} placeholder="60" /></label>
        </div>
        {sized && <p className="note">= {sized.sp} skid spot{sized.sp === 1 ? "" : "s"} (one spot = 48 × 40 in){sized.two ? ", stacked two high" : ""}. Trucks too short inside are ruled out.</p>}
        <label className="chk"><input type="checkbox" checked={f.stackable} onChange={e => set("stackable", e.target.checked)} /> Stackable (can go two high)</label>
        <label className="chk"><input type="checkbox" checked={f.tdg} onChange={e => set("tdg", e.target.checked)} /> Dangerous goods (TDG): never stacked, driver needs a TDG certificate</label>
        <label className="chk"><input type="checkbox" checked={f.tailgate} onChange={e => set("tailgate", e.target.checked)} /> Needs a tailgate (no dock): only straight trucks</label>
        <label className="f">Customer reference<input type="text" value={f.ref} onChange={e => set("ref", e.target.value)} /></label>
      </section>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="bigbtn" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save order in Elite"}</button>
    </>
  );
}
