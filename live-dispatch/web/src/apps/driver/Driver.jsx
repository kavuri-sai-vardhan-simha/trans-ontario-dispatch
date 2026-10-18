import { useEffect, useMemo, useState } from "react";
import { post, useFetch, useLive } from "../../shared/api.js";
import { fmtT, fmtN } from "../../shared/fmt.js";
import LiveMap from "../../shared/LiveMap.jsx";
import Prefs from "../../shared/Prefs.jsx";

/* Driver screen. Not a new app: these are the features we'd add inside the driver app Trans Ontario already uses.
   Optional: trucks move and stops are marked done by GPS whether or not the driver opens this. */
export default function Driver() {
  const params = new URLSearchParams(location.search);
  const [u, setU] = useState(params.get("u") != null ? +params.get("u") : null);
  const choose = v => { setU(v); history.replaceState(null, "", v == null ? "/driver" : `/driver?u=${v}`); };
  return u == null ? <Pick onPick={choose} /> : <Shift u={u} onSwitch={() => choose(null)} />;
}

function Pick({ onPick }) {
  const [trucks] = useFetch("/api/trucks", 0, 30000);
  const list = (trucks || []).filter(t => t.status !== "done").sort((a, b) => a.veh.localeCompare(b.veh, "en", { numeric: true }));
  return (
    <div className="drv">
      <div className="drv-top"><span className="k"><span>Driver app · real day replay</span><Prefs /></span><h1>Which truck are you driving?</h1></div>
      <main className="drv-main">
        <div className="pick">
          {!trucks && <span className="note">Loading…</span>}
          <button onClick={() => onPick(trucks.find(t => t.veh === "Truck #218").u)} style={{ borderColor: "var(--accent)" }} hidden={!trucks || !trucks.some(t => t.veh === "Truck #218")}><span><b>Truck #218</b><br /><span className="note">Demo truck: the Gibraltar Rd case</span></span><span>›</span></button>
          {list.map(t => <button key={t.u} onClick={() => onPick(t.u)}><span><b>{t.veh}</b><br /><span className="note">{t.name}</span></span><span className="note">{t.label}</span></button>)}
        </div>
      </main>
    </div>
  );
}

function Shift({ u, onSwitch }) {
  const { snap } = useLive();
  const T = snap ? snap.clock.T : null;
  const trig = `${T == null ? 0 : Math.floor(T)}|${snap ? snap.last_event : 0}`;
  const [t] = useFetch(`/api/trucks/${u}`, trig, 4000);
  const [events] = useFetch("/api/events", snap ? snap.last_event : 0, 10000);
  const [draft, setDraft] = useState(null);
  const [sent, setSent] = useState(null);
  const [problemOpen, setProblemOpen] = useState(false);
  const [msg, setMsg] = useState(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState(null);
  const [mins, setMins] = useState(30);
  const REASONS = [["no_room", "No room on the truck"], ["too_late", "Can't get there in time"], ["hours", "Close to my hours limit"], ["other", "Other"]];

  useEffect(() => { const ping = () => post(`/api/driver/${u}/ping`).catch(() => {}); ping(); const id = setInterval(ping, 10000); return () => clearInterval(id); }, [u]);
  const estimate = t ? Math.max(0, Math.round(t.free_sp * 2) / 2) : 0;
  useEffect(() => { if (t && draft == null) setDraft(Math.round(estimate)); }, [t]);

  const mine = useMemo(() => (events || []).filter(e => e.u === u && (e.kind === "sync" || e.kind === "assign" || (e.kind === "alert" && !e.decline) || (e.kind === "driver" && /^Dispatcher/.test(e.text)))).slice(-5).reverse(), [events, u]);
  const offState = t && t.offer ? t.offer.state : null;
  useEffect(() => { if (offState === "kept" || offState === "decline_approved") setMsg(null); }, [offState]);
  if (!t) return <div className="drv"><main className="drv-main"><span className="note">Loading your route…</span></main></div>;

  const stops = t.plan.filter(s => s.k === "P" || s.k === "D");
  const next = stops.find(s => !s.done);
  const offer = t.offer;
  const ack = async () => { try { await post(`/api/driver/${u}/offer`, { action: "ack" }); setMsg("Got it. It's on your route."); } catch (e) { setMsg(e.message); } };
  const askDecline = async () => {
    if (!reason) { setMsg("Pick a reason first."); return; }
    try { const r = await post(`/api/driver/${u}/offer`, { action: "decline", reason, note }); setMsg(r.ok ? "Request sent. Dispatch decides; keep it on your route until they answer." : r.why); setDeclining(false); } catch (e) { setMsg(e.message); }
  };
  const sendSpace = async () => { try { const r = await post(`/api/driver/${u}/space`, { free: draft }); setSent({ v: draft, calc: r.calc }); } catch (e) { setMsg(e.message); } };
  const problem = async kind => { try { await post(`/api/driver/${u}/problem`, { kind, minutes: mins }); setProblemOpen(false); setMsg(["sick", "truck"].includes(kind) ? "Dispatch has been alerted. Stay with the truck; you'll get an answer here." : "Sent to dispatch. They decide; you'll see the answer here."); } catch (e) { setMsg(e.message); } };
  const phoneGps = async () => { try { await post(`/api/driver/${u}/gps-gap`, { minutes: 20 }); setMsg("Sharing your phone's location for 20 minutes."); } catch (e) { setMsg(e.message); } };

  const ahead = t.plan.filter(s => !s.done).slice(0, 4);
  const pins = ahead.filter(s => s.k === "P" || s.k === "D").map(s => ({ id: "s" + s.j, kind: s.k === "P" ? "pickup" : "drop", lat: s.lat, lng: s.lng, label: `${fmtT(s.arr)} ${s.a}` }));
  const lines = [{ pts: [[t.lat, t.lng]].concat(ahead.map(s => [s.lat, s.lng])), color: "var(--accent)", weight: 4 }];
  const stopped = t.status === "down" || t.status === "held";

  return (
    <div className="drv">
      <div className="drv-top">
        <span className="k"><span>Driver app · {t.veh} · {t.code}</span><span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Prefs /><button onClick={onSwitch} style={{ background: "none", border: 0, color: "var(--muted)", cursor: "pointer", fontSize: 11, padding: 0, minHeight: 32 }}>Switch truck</button></span></span>
        <h1>{stopped ? (t.status === "held" ? "A spare driver is coming" : "Help is on the way") : next ? `Next: ${next.a}` : "Route done"}</h1>
        <span className="note">{t.label} · {snap ? snap.clock.label : ""}</span>
      </div>
      <main className="drv-main">
        {msg && <div className="dcard"><span className="okt">{msg}</span></div>}

        {offer && (offer.state === "new" || offer.state === "seen") && !stopped && (
          <div className="dcard offer">
            <span className="note" style={{ color: "#E7ECFE", textTransform: "uppercase", letterSpacing: ".08em" }}>New pickup added by dispatch</span>
            <h2>{offer.a}</h2>
            <span className="sub">{offer.c} · {fmtN(offer.w)} lb · {offer.sp} skid{offer.sp === 1 ? "" : "s"} · already added to your route</span>
            {!declining ? <>
              <div className="two">
                <button className="dbtn white" onClick={ack} disabled={offer.state === "seen"}>{offer.state === "seen" ? "Seen" : "OK, got it"}</button>
                <button className="dbtn ghost" onClick={() => setDeclining(true)}>Ask to decline</button>
              </div>
              <span className="sub">{offer.reminded ? <b style={{ color: "#fff" }}>Reminder: please confirm now. Dispatch will call you if there's no answer.</b> : "Please confirm within 5 minutes. It stays on your route; only dispatch can take it off."}</span>
            </> : <>
              <span className="sub" style={{ color: "#fff", fontWeight: 700 }}>Why can't you take it?</span>
              {REASONS.map(([k, l]) => (
                <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, minHeight: 36 }}><input type="radio" name="why" checked={reason === k} onChange={() => setReason(k)} /> {l}</label>
              ))}
              <input type="text" placeholder="Add a detail (optional)" value={note} onChange={e => setNote(e.target.value)} style={{ background: "#fff", color: "#0B1430" }} />
              <div className="two"><button className="dbtn white" onClick={askDecline}>Send to dispatch</button><button className="dbtn ghost" onClick={() => setDeclining(false)}>Cancel</button></div>
            </>}
          </div>
        )}
        {offer && offer.state === "decline_requested" && !stopped && (
          <div className="dcard"><b>Waiting for dispatch</b><span className="sub">You asked to decline {offer.a}: {offer.reason}. Keep it on your route until dispatch answers.</span></div>
        )}
        {offer && offer.state === "kept" && !stopped && (
          <div className="dcard"><b>Dispatch kept {offer.a} on your route</b>{offer.note && <span className="sub">"{offer.note}"</span>}</div>
        )}
        {offer && offer.state === "cancelled" && !stopped && (
          <div className="dcard"><span className="okt">Cancelled in Elite: {offer.a} is off your route.</span></div>
        )}
        {offer && offer.state === "decline_approved" && !stopped && (
          <div className="dcard"><span className="okt">Dispatch approved: {offer.a} is off your route.</span></div>
        )}

        {stopped && (
          <div className="dcard alert">
            <h2>{t.status === "held" ? "Stay with the truck" : "Stay safe; dispatch has a plan"}</h2>
            <span className="sub" style={{ color: "var(--crit)" }}>{t.label}</span>
            {mine.slice(0, 2).map(e => <span key={e.id} className="sub" style={{ color: "var(--crit)" }}>{e.text}</span>)}
          </div>
        )}

        {!stopped && (
          <div className="dcard">
            <b>Free floor spots right now?</b>
            <span className="sub">We estimate {estimate} from your orders in Elite{t.est ? " (some sizes are estimated)" : ""}. Only answer if it looks different.</span>
            <div className="stepper">
              <button aria-label="One less" onClick={() => setDraft(Math.max(0, (draft || 0) - 1))}>−</button>
              <span className="n">{draft ?? "—"}</span>
              <button aria-label="One more" onClick={() => setDraft(Math.min(26, (draft || 0) + 1))}>+</button>
              <button className="dbtn green" style={{ marginLeft: "auto" }} onClick={sendSpace}>Send</button>
            </div>
            {sent && <span className="okt">Sent {sent.v} free. Dispatch now uses your number{Math.abs(sent.v - sent.calc) > 2 ? " and will check the order sizes" : ""}.</span>}
          </div>
        )}

        {!stopped && (
          <div className="dcard">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><b>Count free space from a photo</b><span className="tag next">In development</span></div>
            <span className="sub">Take a photo of the open trailer. AI will count the skids and empty floor and suggest the free spots for you to confirm. Not active in this prototype: enter the number above.</span>
            <label className="dbtn dark" style={{ textAlign: "center", display: "grid", placeItems: "center" }}>
              Take a photo (preview)
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { const f = e.target.files && e.target.files[0]; if (f) setPhoto(URL.createObjectURL(f)); }} />
            </label>
            {photo && <><img src={photo} alt="Trailer photo" style={{ width: "100%", borderRadius: 10 }} /><span className="sub">Photo kept on this phone only. The AI count is coming in a later version.</span></>}
          </div>
        )}

        {!stopped && <LoadPlan t={t} />}

        <div className="dmap"><LiveMap trucks={[[u, t.lat, t.lng, t.status, t.fill, t.src]]} names={{ [u]: t.veh }} pins={pins} lines={lines} focus={[u]} fitKey={u + "|" + (next ? next.j : "")} fitPts={[[t.lat, t.lng]].concat(ahead.map(s => [s.lat, s.lng]))} /></div>

        <div className="dcard">
          <b>Today's stops</b>
          {stops.map(s => {
            const isNext = next && s.j === next.j;
            const tag = s.failed ? ["moved", "Failed · on board"] : s.retry ? ["next", "Re-attempt"] : s.done ? ["done", "Done"] : t.status === "down" ? ["moved", "Handed over"] : t.status === "held" ? ["next", "Later"] : isNext ? ["next", "Next"] : s.ins ? ["new", "New"] : null;
            return (
              <div key={s.j} className={"stop" + (s.done || t.status === "down" ? " done" : "") + (isNext && !stopped ? " next" : "") + (s.ins ? " new" : "")}>
                <span className="t">{fmtT(s.arr)}</span>
                <span><b>{s.a}</b><div className="s">{s.k === "P" ? "Pickup" : "Delivery"}{s.svc ? ` · ${s.svc.toLowerCase()}` : ""}{s.w ? ` · ${fmtN(s.w)} lb` : ""}{s.appt != null ? ` · appt ${fmtT(s.appt)}` : ""}{s.ins ? " · added by dispatch" : ""}</div></span>
                {tag ? <span className={"tag " + tag[0]}>{tag[1]}</span> : <span />}
              </div>
            );
          })}
          <span className="note">Arrived and done are marked automatically by the truck's GPS. Nothing to tap.</span>
        </div>

        {!stopped && (
          <div className="dcard">
            <button className="dbtn outline-red" onClick={() => setProblemOpen(!problemOpen)}>Report a problem</button>
            {problemOpen && <>
              <button className="dbtn red" onClick={() => problem("sick")}>I'm unwell, can't continue</button>
              <button className="dbtn dark" onClick={() => problem("truck")}>Truck problem, can't drive</button>
              <div className="stepper"><span className="sub">About</span>
                <button aria-label="Less time" onClick={() => setMins(Math.max(10, mins - 10))}>−</button><span className="n" style={{ fontSize: 20 }}>{mins}</span>
                <button aria-label="More time" onClick={() => setMins(Math.min(180, mins + 10))}>+</button><span className="sub">min</span></div>
              <button className="dbtn dark" onClick={() => problem("late")}>Stuck in traffic</button>
              <button className="dbtn dark" onClick={() => problem("notready")}>Freight not ready at this pickup</button>
              <button className="dbtn dark" onClick={() => problem("failed")}>Couldn't deliver here (closed / refused)</button>
            </>}
            <button className="dbtn dark" onClick={phoneGps}>Truck GPS not updating? Share my phone's location</button>
          </div>
        )}

        {mine.length > 0 && <div className="dcard"><b>From dispatch</b>{mine.map(e => <div key={e.id} className="msg"><span>{fmtT(e.T)}</span><span>{e.text}</span></div>)}</div>}
      </main>
    </div>
  );
}

/* Unloading order and securement for what is on board now (LIFO: next delivery at the door, last at the nose). */
function LoadPlan({ t }) {
  const nxt = t.plan.find(s => !s.done && (s.k === "P" || s.k === "D"));
  if (!nxt) return null;
  const rt = (t.plan.find(s => !s.done) || {}).rt;
  const route = t.plan.filter(s => s.rt === rt || s.j >= nxt.j);
  const drops = route.filter(s => !s.done && s.k === "D" && !s.failed && !s.retry);
  const back = route.filter(s => (s.done && s.k === "P") || s.failed);
  const all = drops.concat(back);
  if (!all.length) return null;
  const straps = all.some(s => s.straps), tdg = all.some(s => s.tdg), partial = t.fill < 0.9;
  return (
    <div className="dcard">
      <b>Load plan</b>
      <span className="sub">Unload in this order: next delivery at the door, the last one at the nose.</span>
      {drops.map((s, i) => <div key={s.j} className="msg"><span>{i === 0 ? "Door" : i + 1}</span><span>{s.a} · {fmtN(s.w)} lb · {s.sp} skid{s.sp === 1 ? "" : "s"}{s.tdg ? " · TDG" : ""}</span></div>)}
      {back.length > 0 && <div className="msg"><span>Nose</span><span>Back to the depot: {back.map(s => `${s.a}${s.failed ? " (failed delivery)" : ""}`).join(", ")}</span></div>}
      <span className="sub">{[partial ? "Partial load: load bar or straps behind the last skid" : "Full load: check the doors close on the last row",
        straps ? "straps requested in Elite for some of this freight" : null,
        tdg ? "dangerous goods on board: placards and TDG papers in the cab" : null].filter(Boolean).join(" · ")}.</span>
    </div>
  );
}
