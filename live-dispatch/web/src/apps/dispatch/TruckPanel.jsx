import { useEffect, useState } from "react";
import { get, post } from "../../shared/api.js";
import { fmtT, fmtN, fmtDur, kmTxt, STATUS } from "../../shared/fmt.js";

/* One truck: where it is, what is on board, room left, its stops ahead, and disruption handling. */
export default function TruckPanel({ u, t, T, onClose, onOrder, flash }) {
  const [bd, setBd] = useState(null);       // breakdown preview
  const [sk, setSk] = useState(null);       // sick-call options
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!t || t.u !== u) return <div className="empty">Loading truck…</div>;
  const onRoad = t.status === "moving" || t.status === "stop";
  const ahead = t.plan.filter(s => !s.done);
  const done = t.plan.filter(s => s.done);
  const wPct = Math.min(100, (t.on_w / t.cap) * 100), sPct = Math.min(100, (t.on_sp / t.spots) * 100);

  const preview = async () => { setBusy(true); try { setBd(await get(`/api/trucks/${u}/breakdown`)); } catch (e) { flash(e.message); } setBusy(false); };
  const apply = async () => { setBusy(true); try { const r = await post(`/api/trucks/${u}/breakdown`); flash(r.err || `Done: ${r.moved} pickups moved, rescue truck sent.`); setBd(null); } catch (e) { flash(e.message); } setBusy(false); };
  const sick = async () => { setBusy(true); try { setSk(await get(`/api/trucks/${u}/sick`)); } catch (e) { flash(e.message); } setBusy(false); };
  const sickApply = async choice => { setBusy(true); try { const r = await post(`/api/trucks/${u}/sick`, { choice }); flash(r.err || (choice === "spare" ? "Spare driver assigned. Elite and Samsara updated." : choice === "partner" ? "Truck stopped; deliveries offered to a partner, pickups moved." : "Work shared out: rescue truck sent, pickups moved.")); setSk(null); } catch (e) { flash(e.message); } setBusy(false); };
  const canSick = !["done", "down", "held"].includes(t.status);
  const decide = async decision => { setBusy(true); try { const r = await post(`/api/trucks/${u}/decline`, { decision, note }); flash(r.ok ? (decision === "approve" ? "Decline approved: the pickup is back in the waiting list." : "Kept on the truck. The driver has been told.") : r.why); setNote(""); } catch (e) { flash(e.message); } setBusy(false); };
  const off = t.offer;
  const report = async (kind, minutes) => { setBusy(true); try { await post(`/api/driver/${u}/problem`, { kind, minutes }); } catch (e) { flash(e.message); } setBusy(false); };
  const gap = async () => { try { await post(`/api/driver/${u}/gps-gap`, { minutes: 20 }); flash("Samsara silent for 20 min: position now from the driver's phone."); } catch (e) { flash(e.message); } };

  return (
    <>
      <div className="dh">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="lab">Truck · {t.cls}</span>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <h2>{t.veh}</h2>
        <div className="muted">Driver {t.code} · {t.name}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span className={"chip" + (t.status === "down" ? " crit" : onRoad ? " acc" : "")}>{STATUS[t.status]}</span>
          <span className="chip" title="Where the position comes from">{t.src === "Samsara" ? "Samsara GPS · live" : `Driver phone (Samsara silent ${Math.round(t.age)} min)`}</span>
          {t.driver_app && <span className="chip ok">Driver app open</span>}
        </div>
        <div>{t.label}</div>
        {off && off.state === "decline_requested" && (
          <div className="card" style={{ borderColor: "var(--crit)", display: "grid", gap: 8 }}>
            <b className="crit">Driver asks to decline a pickup</b>
            <span><b>{off.a}</b> · {fmtN(off.w)} lb · {off.sp} skid{off.sp === 1 ? "" : "s"}</span>
            <span>Reason: <b>{off.reason}</b></span>
            <label className="f">Note to the driver (optional)<input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. space confirmed, please take it" /></label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" disabled={busy} onClick={() => decide("approve")}>Approve decline</button>
              <button className="btn primary" disabled={busy} onClick={() => decide("override")}>Keep it on this truck</button>
            </div>
            <span className="muted" style={{ fontSize: 11.5 }}>Approve: the pickup goes back to the waiting list with the next best trucks. Keep: it stays on the route and the driver sees your note.</span>
          </div>
        )}
        {off && off.state === "new" && (
          <div className="card" style={{ borderColor: off.age >= off.call_at ? "var(--crit)" : "var(--line)", display: "grid", gap: 6 }}>
            {off.age >= off.call_at
              ? <b className="crit">No answer from the driver for {Math.round(off.age)} min: call them</b>
              : <b>Assigned {off.a}: waiting for the driver to confirm ({Math.round(off.age)} min)</b>}
            <span className="muted" style={{ fontSize: 12 }}>The route, Elite and Samsara are already updated. {off.reminded ? `Automatic reminder (push + call) sent at ${fmtT(off.reminded)}. ` : `Automatic reminder at ${off.remind_at} min, your call at ${off.call_at} min. `}</span>
            {off.age >= off.call_at && <button className="btn primary small" disabled={busy} onClick={async () => { setBusy(true); try { const r = await post(`/api/trucks/${u}/confirm-call`); flash(r.ok ? "Noted: the driver confirmed by phone." : r.why); } catch (e) { flash(e.message); } setBusy(false); }}>Driver confirmed by phone</button>}
          </div>
        )}
        {off && off.state === "seen" && <div className="chip ok" style={{ whiteSpace: "normal", padding: "6px 10px" }}>Driver confirmed {off.a}{off.by_phone ? " (by phone)" : ""}.</div>}
        {off && off.state === "kept" && <div className="chip ok" style={{ whiteSpace: "normal", padding: "6px 10px" }}>You kept {off.a} on this truck (driver had asked to decline: {off.reason}).</div>}
        {t.problem && ["sick", "truck"].includes(t.problem.kind) && <div className="chip crit" style={{ whiteSpace: "normal", padding: "6px 10px" }}>Driver reported {t.problem.kind === "sick" ? "being unwell" : "a truck problem"} at {fmtT(t.problem.T)}. Choose what to do below.</div>}
        {t.problem && ["late", "notready", "failed"].includes(t.problem.kind) && <ProblemCard u={u} p={t.problem} flash={flash} onOrder={onOrder} />}
        {t.flags.map((f, i) => <div key={i} className="muted" style={{ fontSize: 11.5 }}>⚑ {f}</div>)}
      </div>

      <div className="sec">
        <h3>On board now</h3>
        <div className="meter"><div className="ml"><span>Weight</span><span className="num">{fmtN(t.on_w)} / {fmtN(t.cap)} lb</span></div><div className="bar"><i className={wPct >= 90 ? "full" : wPct >= 70 ? "hi" : ""} style={{ width: wPct + "%" }} /></div></div>
        <div className="meter"><div className="ml"><span>Floor spots</span><span className="num">{t.on_sp.toFixed(1)} / {t.spots}{t.est && <span className="est" title="Some skid spots are not recorded in Elite and were estimated"> est.</span>}</span></div><div className="bar"><i className={sPct >= 90 ? "full" : sPct >= 70 ? "hi" : ""} style={{ width: sPct + "%" }} /></div></div>
        <div><b className="ok">Room left: {fmtN(t.free_w)} lb · {Math.max(0, t.free_sp).toFixed(1)} spots</b> <span className="muted">(we plan to 95% of the floor)</span></div>
        {t.tap ? <div className="muted" style={{ fontSize: 12 }}>Driver reported {t.tap.free} spots free at {fmtT(t.tap.t)} (we had estimated {t.tap.calc.toFixed(1)}). Their number is used.</div>
          : <div className="muted" style={{ fontSize: 12 }}>Worked out from Elite: deliveries still on board + freight picked up. The driver can confirm with one tap.</div>}
        <div className="meter"><div className="ml"><span>Driver on duty</span><span className="num">{fmtDur(t.duty_used)} / 14 h</span></div><div className="bar"><i className={t.duty_used > 12 * 60 ? "full" : t.duty_used > 10 * 60 ? "hi" : ""} style={{ width: Math.min(100, t.duty_used / 840 * 100) + "%" }} /></div></div>
      </div>

      <div className="sec">
        <h3>Stops ahead <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>{ahead.filter(s => s.k === "P" || s.k === "D").length} left</span></h3>
        <div className="tl">
          {ahead.map(s => <Stop key={s.j} s={s} onOrder={onOrder} />)}
          {!ahead.length && <div className="muted">No stops left.</div>}
        </div>
        {done.length > 0 && <details><summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>{done.length} stops done</summary><div className="tl">{done.map(s => <Stop key={s.j} s={s} onOrder={onOrder} />)}</div></details>}
      </div>

      <div className="sec">
        <h3>Something went wrong?</h3>
        <button className={"btn" + (t.problem ? " primary" : " danger")} disabled={!canSick || busy} onClick={sick}>Driver called in sick / can't continue</button>
        <button className="btn danger" disabled={!onRoad || busy} onClick={preview}>Truck broke down here</button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <button className="btn small" disabled={!onRoad || busy} onClick={() => report("late", 30)} title="Samsara shows the truck behind schedule">Traffic delay</button>
          <button className="btn small" disabled={!onRoad || busy} onClick={() => report("notready", 30)} title="Shipper's freight isn't ready (late shipment)">Freight not ready</button>
          <button className="btn small" disabled={!onRoad || busy} onClick={() => report("failed")} title="Receiver closed, refused or no one there">Failed delivery</button>
        </div>
        {!onRoad && <span className="muted" style={{ fontSize: 12 }}>Only for a truck on the road.</span>}
        <details><summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>Prototype tools</summary>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            <button className="btn small" disabled={!onRoad} onClick={gap}>Simulate a Samsara gap (20 min)</button>
            <a className="btn small" href={`/driver?u=${u}`} target="_blank" rel="noreferrer">Open this truck's driver screen</a>
          </div>
        </details>
      </div>

      {sk && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Driver off sick" onClick={e => e.target === e.currentTarget && setSk(null)}>
          <div className="box">
            {sk.err ? <><h3>{sk.err}</h3><button className="btn" onClick={() => setSk(null)}>Close</button></> : <>
              <div><span className="lab">{sk.morning ? "Before the truck leaves" : "During the route"} · {fmtT(sk.T)}</span>
                <h2 style={{ fontSize: 20 }}>{sk.driver} can't drive {sk.veh}</h2>
                <p className="muted">{sk.label}{sk.share ? ` · ${fmtN(sk.share.on.w)} lb ${sk.morning ? "loaded" : "on board"} · ${sk.share.dels} deliveries and ${sk.share.pks} pickups left` : ""}</p></div>

              <div className={"opt" + (sk.spare && !sk.spare.late ? " best" : "")}>
                <div className="oh"><b>1. Spare driver takes the same truck</b>{sk.spare ? <span className={"chip " + (sk.spare.late ? "warn" : "ok")}>{sk.spare.late ? `${sk.spare.late} late` : "all on time"}</span> : <span className="chip">none free</span>}</div>
                {sk.spare ? <>
                  <span>Driver {sk.spare.code} {sk.spare.name} ({sk.spare.lic}, {sk.spare.lic_note}): off today on the roster.</span>
                  <span className="muted" style={{ fontSize: 12 }}>{sk.spare.how.charAt(0).toUpperCase() + sk.spare.how.slice(1)}; takes over at <b>{fmtT(sk.spare.until)}</b>. Route unchanged, stops about {Math.round(sk.spare.delay)} min later · {sk.spare.assumed}. No extra vehicle.</span>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn small primary" disabled={busy} onClick={() => sickApply("spare")}>Use spare driver</button></div>
                </> : <span className="muted" style={{ fontSize: 12 }}>No driver with the right licence is free today.</span>}
              </div>

              <div className={"opt" + (!sk.spare || sk.spare.late ? " best" : "")}>
                <div className="oh"><b>2. Share the work with other trucks</b>{sk.share && <span className={"chip " + (sk.share.rescue[0]?.late ? "warn" : "ok")}>{sk.share.rescue.length ? (sk.share.rescue[0].late ? `${sk.share.rescue[0].late} late` : "all on time") : "no truck with room"}</span>}</div>
                {sk.share && <>
                  {sk.share.rescue[0] ? <span>{sk.morning ? <>Reload its deliveries onto <b>{sk.share.rescue[0].veh}</b> at the depot ({fmtT(sk.share.rescue[0].meet)}).</> : <><b>{sk.share.rescue[0].veh}</b> meets the truck at <b>{fmtT(sk.share.rescue[0].meet)}</b>, takes the freight on board.</>} Deliveries done by {fmtT(sk.share.rescue[0].done)}.</span>
                    : <span className="crit">No truck has room for the whole load.</span>}
                  {sk.share.moves.map(m => <span key={m.pid} className="muted" style={{ fontSize: 12 }}>Pickup {m.a} → {m.to ? `${m.to} at ${fmtT(m.arr)}` : "no truck now (stays waiting)"}</span>)}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn small" disabled={busy || !sk.share.rescue.length} onClick={() => sickApply("share")}>Share it out</button></div>
                </>}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn" onClick={() => setSk(null)}>Cancel</button></div>
            </>}
          </div>
        </div>
      )}

      {bd && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Breakdown" onClick={e => e.target === e.currentTarget && setBd(null)}>
          <div className="box">
            {bd.err ? <><h3>{bd.err}</h3><button className="btn" onClick={() => setBd(null)}>Close</button></> : <>
              <div><span className="lab">Breakdown at {fmtT(bd.T)}</span><h2 style={{ fontSize: 20 }}>{bd.veh} can't continue</h2>
                <p className="muted">{fmtN(bd.on.w)} lb on board · {bd.dels} deliveries and {bd.pks} pickups left.</p></div>
              <div className="sec" style={{ padding: 0, border: 0 }}>
                <h3>1. Rescue truck for the freight on board</h3>
                {!bd.rescue.length && <p className="crit">No truck on the road has room for the whole load. Send a truck from the depot.</p>}
                {bd.rescue.map((r, i) => (
                  <div key={r.u} className={"opt" + (i === 0 ? " best" : "")}>
                    <div className="oh"><span><b>{r.veh}</b> meets it at <b>{fmtT(r.meet)}</b></span><span className={"chip " + (r.late ? "warn" : "ok")}>{r.late ? `${r.late} late` : "all on time"}</span></div>
                    <span className="muted" style={{ fontSize: 12 }}>Moves the freight over, then does the {bd.dels} deliveries · done by {fmtT(r.done)} · {Math.round(r.km)} km</span>
                  </div>
                ))}
              </div>
              <div className="sec" style={{ padding: 0, border: 0 }}>
                <h3>2. Its pickups go to other trucks (same 3 checks)</h3>
                {!bd.moves.length && <p className="muted">No pickups left on this truck.</p>}
                {bd.moves.map(m => <div key={m.pid}>{m.a} → {m.to ? <b>{m.to} at {fmtT(m.arr)}</b> : <span className="crit">no truck can take it now (stays waiting)</span>}</div>)}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn" onClick={() => setBd(null)}>Cancel</button>
                <button className="btn primary" disabled={busy} onClick={apply}>Apply: mark broken down and move the work</button>
              </div>
            </>}
          </div>
        </div>
      )}
    </>
  );
}

/* Traffic delay · freight not ready (late shipment) · failed delivery: what it does to this truck, and the choices. */
function ProblemCard({ u, p, flash, onOrder }) {
  const [o, setO] = useState(null);
  const [min, setMin] = useState(p.min || 30);
  const [busy, setBusy] = useState(false);
  const key = `${u}|${p.kind}|${p.T}`;
  useEffect(() => { let alive = true; setO(null); get(`/api/trucks/${u}/problem`).then(r => alive && setO(r)).catch(e => flash(e.message)); return () => { alive = false; }; }, [key]);
  const apply = async choice => { setBusy(true); try { const r = await post(`/api/trucks/${u}/problem`, { choice, minutes: min }); flash(r.err || "Done. Elite and Samsara updated; the driver sees it."); } catch (e) { flash(e.message); } setBusy(false); };
  const title = { late: "Running late (traffic)", notready: "Freight not ready (late shipment)", failed: "Failed delivery" }[p.kind];
  const k = o && o.kind === p.kind ? p.kind : null;      // only show an answer that matches the problem reported
  const Broken = ({ list }) => list && list.length ? <div className="crit" style={{ fontSize: 12 }}>Would now be late: {list.map(b => `${b.a}${b.appt != null ? ` (appt ${fmtT(b.appt)})` : ""}`).join(", ")}</div> : <div className="ok" style={{ fontSize: 12 }}>Every other promise on this truck still kept.</div>;
  return (
    <div className="card" style={{ borderColor: "var(--crit)", display: "grid", gap: 8 }}>
      <b className="crit">{title} · reported {fmtT(p.T)}</b>
      {(!o || (!o.err && !k)) && <span className="muted">Checking the route…</span>}
      {o && o.err && <span className="muted">{o.err}</span>}
      {o && !o.err && k === "late" && <>
        <span>About <b>{Math.round(o.min)} min</b> behind. Day ends {fmtT(o.end)} ({o.duty_h.toFixed(1)} h on duty{o.duty_ok ? "" : ", over 14 h"}).</span>
        <Broken list={o.broken} />
        {o.moves.length > 0 && <div style={{ display: "grid", gap: 4 }}><span className="muted" style={{ fontSize: 12 }}>Pickups another truck could take so this one catches up (same 3 checks):</span>
          {o.moves.map(m => <span key={m.pid} style={{ fontSize: 12 }}><a href="#" onClick={e => { e.preventDefault(); onOrder(m.pid); }}>{m.a}</a> → {m.veh} at {fmtT(m.arr)} (+{kmTxt(m.km)})</span>)}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn primary small" disabled={busy} onClick={() => apply("apply")}>Update ETAs (+{Math.round(o.min)} min)</button></div>
      </>}
      {o && !o.err && k === "notready" && <>
        <span>At <b>{o.a}</b> ({fmtN(o.w)} lb): ready in about <b>{Math.round(o.min)} min</b> ({fmtT(o.ready_at)}). {o.late_for_cutoff ? <span className="crit">That's after the {fmtT(o.cutoff)} cutoff.</span> : null}</span>
        <div className="opt"><div className="oh"><b>1. Wait for it</b><span className={"chip " + ((o.wait?.broken || []).length || !o.wait?.duty_ok ? "warn" : "ok")}>{(o.wait?.broken || []).length ? `${o.wait.broken.length} late` : "all on time"}</span></div>
          <Broken list={o.wait?.broken} /><div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn small" disabled={busy} onClick={() => apply("wait")}>Wait {Math.round(o.min)} min</button></div></div>
        <div className="opt"><div className="oh"><b>2. Leave; give it a truck when it's ready</b></div>
          <span className="muted" style={{ fontSize: 12 }}>The pickup goes back to the waiting list with ready time {fmtT(o.ready_at)}; the 3 checks pick the best truck then.</span>
          <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn small" disabled={busy || !o.can_leave} onClick={() => apply("leave")}>Leave it</button></div></div>
      </>}
      {o && !o.err && k === "failed" && <>
        <span>Couldn't deliver at <b>{o.a}</b> ({fmtN(o.w)} lb, {o.sp} skid{o.sp === 1 ? "" : "s"}){o.appt != null ? ` · appt ${fmtT(o.appt)}` : ""}.</span>
        <div className="opt"><div className="oh"><b>1. Back to the depot, re-deliver next business day</b></div>
          <span className="muted" style={{ fontSize: 12 }}>Stays on board: room left becomes {fmtN(o.back.free_w)} lb · {Math.max(0, o.back.free_sp).toFixed(1)} spots, so new pickups are checked against that.</span>
          <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn small" disabled={busy} onClick={() => apply("back")}>Bring it back</button></div></div>
        <div className="opt"><div className="oh"><b>2. Try again later today</b><span className={"chip " + (o.retry.ok ? "ok" : "warn")}>{o.retry.ok ? `about ${fmtT(o.retry.arr)}` : "not today"}</span></div>
          {o.retry.ok ? <span className="muted" style={{ fontSize: 12 }}>Before the truck heads back to the depot. Every other promise still kept.</span> : <span className="muted" style={{ fontSize: 12 }}>Not possible: {o.retry.why}.</span>}
          <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn small" disabled={busy || !o.retry.ok} onClick={() => apply("retry")}>Re-attempt today</button></div></div>
      </>}
    </div>
  );
}

function Stop({ s, onOrder }) {
  const kind = { P: "Pickup", D: "Delivery", S: "Depot: load", R: "Depot: unload" }[s.k];
  return (
    <div className={"st" + (s.done ? " done" : "")}>
      <span className="mono">{fmtT(s.arr)}</span>
      <span className={"k " + s.k} />
      <span>
        <b style={s.pid != null ? { cursor: "pointer" } : null} onClick={() => s.pid != null && onOrder(s.pid)}>{s.a}</b>
        {s.ins && !s.retry && <span className="chip ok" style={{ marginLeft: 6 }}>added by you</span>}
        {s.failed && <span className="chip crit" style={{ marginLeft: 6 }}>failed · on board</span>}
        {s.retry && <span className="chip warn" style={{ marginLeft: 6 }}>re-attempt</span>}
        <br /><span className="muted">{kind}{s.svc ? ` · ${s.svc.toLowerCase()}` : ""}{s.w ? ` · ${fmtN(s.w)} lb` : ""}{s.appt != null ? ` · appt ${fmtT(s.appt)}` : ""}</span>
      </span>
      <span className="muted num" style={{ fontSize: 11 }} title="On board after this stop">{s.k === "S" || s.k === "R" ? "" : `${fmtN(s.load_w)} lb`}</span>
    </div>
  );
}
