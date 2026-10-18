import { useState } from "react";
import { post } from "../../shared/api.js";
import { fmtT, fmtN, fmtDur, kmTxt } from "../../shared/fmt.js";
import { TierChip } from "./Dispatch.jsx";

/* One pickup order from Elite: the best trucks right now, why, who was ruled out, and what really happened. */
export default function OrderPanel({ pid, data, T, onClose, onTruck, flash, hl, onHighlight }) {
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  if (!data || data.order.pid !== pid) return <div className="empty">Checking every truck…</div>;
  const o = data.order;
  const best = data.ok;
  const shown = more ? best : best.slice(0, 3);
  const assigned = o.by === "us";

  const assign = async (u, veh) => {
    setBusy(true);
    try {
      const r = await post(`/api/orders/${pid}/assign`, { u });
      if (r.ok) flash(`Assigned to ${veh}. Elite and the Samsara route are updated.`); else flash(`Not possible: ${r.why}`);
    } catch (e) { flash(e.message); }
    setBusy(false);
  };
  const unassign = async () => { setBusy(true); try { await post(`/api/orders/${pid}/unassign`); flash("Taken off the truck. Back in the waiting list."); } catch (e) { flash(e.message); } setBusy(false); };

  return (
    <>
      <div className="dh">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="lab">Pickup · order {o.ordno} · {o.channel || "from Elite"}</span>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <h2>{o.a}</h2>
        <div className="muted">{o.c} · {o.city}</div>
        <dl className="facts">
          <dt>Pick up at</dt><dd>{o.full_a || o.a}</dd>
          <dt>Drop off</dt><dd>{o.drop ? <>{o.drop.a}{o.drop.c ? ` · ${o.drop.c}` : ""} <span className="muted">(same day)</span></>
            : <>Trans Ontario depot today{o.dest ? <>, then <b>{[o.dest.a, o.dest.city].filter(Boolean).join(", ")}</b>{o.dest.name ? ` · ${o.dest.name}` : ""} next business day</> : ", delivered next business day"}</>}</dd>
          <dt>Freight</dt><dd>{fmtN(o.w)} lb{o.we && <span className="est" title="Weight missing in Elite, estimated"> (est.)</span>} · {o.sp} skid spot{o.sp === 1 ? "" : "s"}{o.se && <span className="est" title="Skid spots not recorded in Elite, estimated from weight and pieces"> (est.)</span>}</dd>
          {(o.tdg || o.tg || o.h_in || o.sp_how) && <><dt>Handling</dt><dd>{[o.sp_how && o.sp_how !== "entered" ? `skid spots ${o.sp_how}` : null, o.h_in ? `${Math.round(o.h_in)} in high` : null, o.tg ? "needs a tailgate (no dock)" : null, o.tdg ? "dangerous goods (TDG): never stacked" : null].filter(Boolean).join(" · ")}</dd></>}
          <dt>Service</dt><dd>{o.svc_label} · pick up by <b>{fmtT(o.pickup_by)}</b>{o.drop ? <> · deliver today by <b>{fmtT(o.deliver_by)}</b></> : " · via depot, delivered next business day"}</dd>
          <dt>Customer</dt><dd><TierChip o={o} /> {o.tier === "regular" ? `${o.past} orders on the earlier days · waiting counts 1.5×` : o.tier === "new" ? "No earlier orders" : `${o.past} earlier order${o.past === 1 ? "" : "s"}`}</dd>
          <dt>Ready</dt><dd>{o.ready != null ? fmtT(o.ready) : "Now"}</dd>
          <dt>Status</dt><dd>{o.status === "waiting" ? <span className={"chip " + (o.waiting_min > 120 ? "crit" : "warn")}>Waiting {fmtDur(o.waiting_min)}</span>
            : o.by === "us" ? <span className="chip ok">Assigned by you · {o.truck} · pickup {fmtT(o.pickup_at)}</span>
              : <span className="chip">Given by phone · {o.truck}</span>}</dd>
        </dl>
      </div>

      <div className="sec">
        <h3>Best trucks at {fmtT(T)} <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>{data.n_ok} of {data.n_ok + data.no.reduce((a, g) => a + g.trucks.length, 0)} pass</span></h3>
        <div className="q3">
          <div><b>1. Room?</b>weight + floor spots, until the depot</div>
          <div><b>2. In time?</b>before the {o.svc_label} cutoff ({fmtT(o.pickup_by)}){o.drop ? ", delivered today" : ""}</div>
          <div><b>3. Others on time?</b>its other stops + 14 h day / 70 h week</div>
        </div>
        {!best.length && <div className="real"><b>No truck on the road can take it right now.</b>It stays in the list; check again as trucks free up, or plan it for a truck leaving the depot.</div>}
        {shown.map((x, i) => (
          <div key={x.u} className={"opt" + (i === 0 ? " best" : "") + ((hl ?? shown[0]?.u) === x.u ? " on" : "")} style={{ cursor: "pointer" }}
            title="Show this truck on the map" onClick={e => { if (e.target.closest("button")) return; onHighlight && onHighlight(x.u); }}>
            <div className="oh">
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="rank">{i + 1}</span>
                <span><b style={{ cursor: "pointer" }} onClick={() => onTruck(x.u)}>{x.veh}</b> <span className="muted">· {x.name}</span><br /><span className="muted" style={{ fontSize: 11.5 }}>{x.cls}</span></span></span>
              <span style={{ textAlign: "right" }}><span className="big" style={{ fontSize: 18 }}>{fmtT(x.arr)}</span><br /><span className="muted" style={{ fontSize: 11 }}>pickup</span></span>
            </div>
            <ul>{x.reasons.map((r, k) => <li key={k}>{r}</li>)}</ul>
            {x.conflicts && x.conflicts.length > 0 && <div className="chip warn" style={{ whiteSpace: "normal", padding: "6px 10px" }}>Regular customer waiting nearby needs this truck's room: {x.conflicts.map(c => `${c.a} (waiting ${fmtDur(c.waiting)})`).join("; ")}. Consider assigning that first.</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {data.rank_mode === "cost" ? <span className="muted" style={{ fontSize: 11 }} title="Extra km × $/km + extra driver minutes × $/min + customer wait. Rates are illustrative.">Score ${Math.round(x.cost)} (illustrative, lower is better)</span>
                : <span className="muted" style={{ fontSize: 11 }} title="Customer wait (regular customers count 1.5×) + extra driver minutes + extra km">+{Math.round(x.delay)} min · +{x.km.toFixed(1)} km</span>}
              {o.u === x.u && assigned ? <span className="chip ok">Assigned</span> :
                <button className={"btn small" + (i === 0 ? " primary" : "")} disabled={busy} onClick={() => assign(x.u, x.veh)}>{assigned || o.u != null ? "Move to this truck" : "Assign"}</button>}
            </div>
          </div>
        ))}
        {best.length > 3 && <button className="btn small ghost" onClick={() => setMore(!more)}>{more ? "Show top 3" : `Show ${Math.min(best.length, 8) - 3} more`}</button>}
        {assigned && <button className="btn small danger" disabled={busy} onClick={unassign}>Take it off {o.truck}</button>}
      </div>

      <div className="sec">
        <details className="out">
          <summary>Ruled out ({data.no.reduce((a, g) => a + g.trucks.length, 0)} trucks)</summary>
          {data.no.map(g => (
            <div key={g.reason} className="g">
              <b>{g.reason} ({g.trucks.length})</b>
              {g.trucks.slice(0, 6).map(t => <span key={t.u} className="muted">{t.veh}: {t.why}</span>)}
              {g.trucks.length > 6 && <span className="muted">+{g.trucks.length - 6} more</span>}
            </div>
          ))}
        </details>
      </div>

      {o.real && (
        <div className="sec">
          <h3>What really happened that day</h3>
          <div className="real">
            <span>The dispatcher gave it out by phone at <b>{fmtT(o.real.given)}</b> to <b>{o.real.truck}</b>.</span>
            <span>Picked up at <b>{fmtT(o.real.arr)}</b>{o.ready != null && <> · {fmtDur(o.real.arr - o.ready)} after it was ready</>} · detour +{kmTxt(o.real.km)}.</span>
            {best[0] && <span>Our first choice now: <b>{best[0].veh}</b> at <b>{fmtT(best[0].arr)}</b>{best[0].arr < o.real.arr ? <span className="ok"> ({fmtDur(o.real.arr - best[0].arr)} earlier)</span> : <span className="warnc"> ({fmtDur(best[0].arr - o.real.arr)} later)</span>}.</span>}
          </div>
        </div>
      )}
    </>
  );
}
