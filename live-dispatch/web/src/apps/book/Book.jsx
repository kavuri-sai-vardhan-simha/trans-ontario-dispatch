import { useEffect, useMemo, useState } from "react";
import { post, useFetch, useLive } from "../../shared/api.js";
import { fmtT, fmtN, kmTxt, fmtDay } from "../../shared/fmt.js";
import LiveMap from "../../shared/LiveMap.jsx";
import Prefs from "../../shared/Prefs.jsx";

const store = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: fine */ } },
};
const inGTA = p => p.lat > 43.2 && p.lat < 44.5 && p.lng > -80.4 && p.lng < -78.5;
const hav = (a, b) => { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) * r / 2), y = (b.lat - a.lat) * r; return 6371 * Math.hypot(x, y); };

/* Live demo for people in the room (QR on the dispatcher screen). Stand-in for Trans Ontario's Web Dispatch portal:
   drop a pin, book, and watch the dispatcher pick a truck on the big screen; then track it here. */
export default function Book() {
  const { snap } = useLive();
  const [mine, setMine] = useState(() => store.get("to.audience") || []);
  const [view, setView] = useState(() => (store.get("to.audience") || []).length ? "track" : "book");
  const [ordno, setOrdno] = useState(() => (store.get("to.audience") || [])[0] || "");
  const T = snap ? snap.clock.T : null;
  const booked = o => { const r = [o].concat(mine.filter(x => x !== o)); setMine(r); store.set("to.audience", r); setOrdno(o); setView("track"); };

  return (
    <div className="bk">
      <div className="bk-top">
        <div className="in">
          <div className="row1">
            <img src="/logo.png" alt="Trans Ontario Express" />
            <span style={{ marginLeft: "auto" }}><Prefs onDark /></span>
            <span className="clk" style={{ marginLeft: 0 }}>{snap ? fmtDay(snap.clock.day) : ""} replay<br /><b>{snap ? snap.clock.label : "—"}</b></span>
          </div>
          <div style={{ padding: "2px 0 10px", fontSize: 13 }}><b>Web Dispatch · live demo</b><br /><span style={{ opacity: .9 }}>Book a pickup and watch the dispatcher on the big screen choose a truck.</span></div>
          <div className="bk-tabs" role="tablist">
            <button role="tab" aria-selected={view === "book"} onClick={() => setView("book")}>Book a pickup</button>
            <button role="tab" aria-selected={view === "track"} onClick={() => setView("track")}>My orders{mine.length ? ` (${mine.length})` : ""}</button>
          </div>
        </div>
      </div>
      <main className="bk-main">
        {view === "book" ? <BookForm T={T} onBooked={booked} left={3 - mine.length} /> : <Track ordno={ordno} setOrdno={setOrdno} recent={mine} T={T} />}
      </main>
    </div>
  );
}

function BookForm({ T, onBooked, left }) {
  const [places] = useFetch("/api/places", 0, 600000);
  const [svc] = useFetch("/api/services", T == null ? 0 : Math.floor(T), 15000);
  const [name, setName] = useState("");
  const [service, setService] = useState("OVERNIGHT");
  const [w, setW] = useState(500), [sp, setSp] = useState(1);
  const [from, setFrom] = useState(null), [to, setTo] = useState(null);
  const [which, setWhich] = useState("from");
  const [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const services = svc ? Object.entries(svc.services).filter(([k]) => k !== "AFTER HOURS") : [];
  const cur = svc && svc.services[service];
  useEffect(() => { if (svc && cur && !cur.open) { const o = services.find(([, v]) => v.open); if (o) setService(o[0]); } }, [svc]);

  const near = p => { if (!places) return ""; let b = null, bd = 1e9; for (const q of places) { const d = hav(p, q); if (d < bd) { bd = d; b = q; } } return b ? b.city : ""; };
  const pin = p => {
    if (!inGTA(p)) { setErr("Please drop the pin inside the GTA."); return; }
    setErr(null);
    const city = near(p);
    const v = { a: `Pinned spot${city ? " near " + city : ""}`, city, lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5) };
    if (which === "from") { setFrom(v); setWhich("to"); } else setTo(v);
  };
  const sample = () => {
    if (!places) return;
    const ps = places.filter(p => inGTA(p)); const a = ps[Math.floor(Math.random() * ps.length)], b = ps[Math.floor(Math.random() * ps.length)];
    setFrom({ a: a.a, city: a.city, lat: a.lat, lng: a.lng }); setTo({ a: b.a, city: b.city, lat: b.lat, lng: b.lng }); setWhich("to");
  };
  const pins = [from && { id: "f", kind: "order", lat: from.lat, lng: from.lng, label: "Pickup", hot: true }, to && { id: "t", kind: "drop", lat: to.lat, lng: to.lng, label: "Delivery", hot: true }].filter(Boolean);

  const submit = async () => {
    const miss = [];
    if (!name.trim()) miss.push("your name or company");
    if (!from) miss.push("a pickup pin");
    if (!to) miss.push("a delivery pin");
    if (!cur || !cur.open) miss.push("an open service");
    if (miss.length) { setErr("Please add " + miss.join(", ") + "."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await post("/api/bookings", {
        channel: "Web Dispatch portal (live demo phone)", audience: true, contact: "", service,
        shipper: { name: name.trim().slice(0, 40), address: from.a, city: from.city, lat: from.lat, lng: from.lng },
        consignee: { name: "Receiver", address: to.a, city: to.city, lat: to.lat, lng: to.lng },
        pieces: Math.max(1, Math.ceil(sp)), piece_type: "SKD", weight: +w, spots: +sp, equipment: "TRUCK",
      });
      if (!r.ok) { setErr(r.why); setBusy(false); return; }
      onBooked(r.ordno);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (left <= 0) return <section className="bk-sec"><h3>Thanks for trying it!</h3><p className="note">That's the limit for this demo. Open "My orders" to watch your pickups.</p></section>;
  return (
    <>
      <section className="bk-sec">
        <label className="f">Your name or company<input type="text" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="e.g. Maple Parts Inc." autoComplete="organization" /></label>
      </section>
      <section className="bk-sec">
        <h3>Where? Tap the map</h3>
        <div className="seg" role="group" aria-label="Which pin">
          <button aria-pressed={which === "from"} onClick={() => setWhich("from")}>1 · Pickup{from ? " ✓" : ""}</button>
          <button aria-pressed={which === "to"} onClick={() => setWhich("to")}>2 · Delivery{to ? " ✓" : ""}</button>
        </div>
        <div className="mapbox" style={{ height: 300 }}><LiveMap pins={pins} onMapClick={pin} center={[43.73, -79.45]} zoom={9} fitKey={null} /></div>
        <span className="note">{from ? `Pickup: ${from.a}` : "Tap where the freight is picked up."}{to ? ` · Delivery: ${to.a}` : ""}</span>
        <button className="btn small" onClick={sample} disabled={!places}>Or use two real customer addresses</button>
      </section>
      <section className="bk-sec">
        <h3>Service</h3>
        <div className="svc">
          {services.map(([code, v]) => (
            <button key={code} aria-pressed={service === code} disabled={!v.open} onClick={() => setService(code)}>
              <span className="l1"><span>{v.label}</span><span className={v.open ? "ok" : "crit"} style={{ fontSize: 12 }}>{v.open ? (service === code ? "Selected" : "Open") : "Closed"}</span></span>
              {!v.open && <span className="why">{v.why}</span>}
            </button>
          ))}
        </div>
      </section>
      <section className="bk-sec">
        <h3>Freight</h3>
        <div className="g2">
          <label className="f">Weight (lb)<input type="number" min="1" max="15000" value={w} onChange={e => setW(e.target.value)} /></label>
          <label className="f">Skids<input type="number" min="0.25" max="12" step="0.25" value={sp} onChange={e => setSp(e.target.value)} /></label>
        </div>
      </section>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="bigbtn" disabled={busy} onClick={submit}>{busy ? "Booking…" : "Book pickup"}</button>
      <p className="note">Demo only: your order joins the real day being replayed on the dispatcher's screen. {left} order{left === 1 ? "" : "s"} left on this phone.</p>
    </>
  );
}

function Track({ ordno, setOrdno, recent, T }) {
  const [input, setInput] = useState(ordno);
  const [t, err] = useFetch(ordno ? `/api/track/${encodeURIComponent(ordno)}` : null, T == null ? 0 : Math.floor(T * 2), 3000);
  useEffect(() => setInput(ordno), [ordno]);
  const o = t?.order;

  let head = "", sub = "";
  if (o) {
    if (o.status === "waiting") { head = "Finding the best truck"; sub = `Received ${fmtT(o.known)}. A dispatcher confirms the truck.`; }
    else if (o.status === "picked") { head = `Picked up at ${fmtT(o.pickup_at)}`; sub = t.service?.same_day ? `Delivering today${t.drop_eta ? `, about ${fmtT(t.drop_eta)}` : ""}.` : "Going to the Scarborough depot tonight, delivered next business day."; }
    else if (t.truck) { head = `${t.truck.veh} arrives about ${fmtT(t.truck.eta ?? o.pickup_at)}`; sub = `${t.truck.stops_before ? `${t.truck.stops_before} stop${t.truck.stops_before > 1 ? "s" : ""} before yours · ` : "You're next · "}${kmTxt(t.truck.km_away)} away · live from the truck's GPS`; }
    else { head = o.truck ? `${o.truck} assigned` : "Truck assigned"; sub = ""; }
  }
  const trucks = t?.truck && o?.status !== "picked" ? [[o.u ?? 0, t.truck.lat, t.truck.lng, "moving", 0.3, "Samsara"]] : [];
  const pins = o ? [{ id: "p", kind: "order", lat: o.lat, lng: o.lng, label: "Your pickup", hot: true }].concat(o.drop ? [{ id: "d", kind: "drop", lat: o.drop.lat, lng: o.drop.lng, label: "Delivery" }] : []) : [];
  const lines = t?.truck && o?.status !== "picked" ? [{ pts: [[t.truck.lat, t.truck.lng], [o.lat, o.lng]], color: "var(--accent)", dash: "6 6", weight: 3 }] : [];
  const fitPts = o ? [[o.lat, o.lng]].concat(t?.truck ? [[t.truck.lat, t.truck.lng]] : []) : null;
  const nowStep = t ? t.steps.findIndex(s => !s.done) : -1;

  return (
    <>
      <section className="bk-sec">
        <label className="f">Order number
          <div style={{ display: "flex", gap: 8 }}>
            <input type="text" inputMode="numeric" value={input} onChange={e => setInput(e.target.value.trim())} onKeyDown={e => e.key === "Enter" && setOrdno(input)} placeholder="e.g. 2988947" />
            <button className="btn primary" onClick={() => setOrdno(input)}>Track</button>
          </div>
        </label>
        <div className="recent">
          {recent.map(r => <button key={r} className="chip acc" onClick={() => setOrdno(r)}>#{r} (yours)</button>)}
        </div>
      </section>
      {ordno && err && <p className="err">Order {ordno} not found.</p>}
      {o && (
        <>
          <section className="bk-sec track-head">
            <span className="lab">Order {o.ordno} · {o.svc_label}</span>
            <span className="h">{head}</span>
            {sub && <span className="muted">{sub}</span>}
            <span className="note">{o.a} · {fmtN(o.w)} lb · {o.sp} skid{o.sp === 1 ? "" : "s"}{o.drop ? ` → ${o.drop.a}` : ""}</span>
          </section>
          <div className="mapbox"><LiveMap trucks={trucks} names={t?.truck ? { [o.u ?? 0]: t.truck.veh } : {}} pins={pins} lines={lines} focus={trucks.length ? [o.u ?? 0] : null} fitKey={o.ordno + (t?.truck ? t.truck.veh : "")} fitPts={fitPts} /></div>
          <section className="bk-sec">
            <div className="steps">
              {t.steps.map((s, i) => (
                <div key={s.k} className={"step " + (s.done ? "done" : i === nowStep ? "now" : "todo")}><i /><span><b>{s.label}</b>{s.t != null && <div className="note">{fmtT(s.t)}</div>}</span></div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
