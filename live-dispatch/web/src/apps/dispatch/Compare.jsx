import { useMemo, useState } from "react";
import { useFetch } from "../../shared/api.js";
import { fmtT, fmtN, fmtDur, kmTxt } from "../../shared/fmt.js";

/* Every real Sep 29 pickup: what the dispatcher did by phone vs what our system suggests at the same moment.
   Fills in as the replay clock runs ("so far"), or shows the whole day. */
export default function Compare({ T, onOpen }) {
  const [mode, setMode] = useState("ready");
  const [scope, setScope] = useState("sofar");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [after9, setAfter9] = useState(true);
  const upto = scope === "sofar" && T != null ? Math.floor(T) : null;
  const [data] = useFetch(`/api/compare/rows?mode=${mode}${upto != null ? `&upto=${upto}` : ""}`, upto, 20000);

  const rows = useMemo(() => {
    let r = (data?.rows || []).slice().sort((a, b) => a.decide - b.decide);
    if (after9) r = r.filter(x => x.entered >= 540);
    if (filter === "earlier") r = r.filter(x => x.ours && x.gain_min > 15);
    if (filter === "later") r = r.filter(x => x.ours && x.gain_min < -15);
    if (filter === "same") r = r.filter(x => x.ours && x.ours.same);
    if (filter === "none") r = r.filter(x => !x.ours);
    if (q) r = r.filter(x => (x.a + " " + x.ordno + " " + (x.city || "") + " " + (x.manual.truck || "") + " " + (x.ours?.truck || "")).toLowerCase().includes(q.toLowerCase()));
    return r;
  }, [data, filter, q, after9]);
  const s = useMemo(() => {
    const all = (data?.rows || []).filter(x => !after9 || x.entered >= 540), d = all.filter(x => x.ours);
    const sum = f => d.reduce((a, x) => a + (f(x) || 0), 0);
    return data ? { n: all.length, decided: d.length, earlier: d.filter(x => x.gain_min > 15).length, later: d.filter(x => x.gain_min < -15).length,
      same_truck: d.filter(x => x.ours.same).length, manual_km: sum(x => x.manual.km), our_km: sum(x => x.ours.km),
      manual_wait: sum(x => x.manual.wait) / Math.max(1, d.length), our_wait: sum(x => x.ours.wait) / Math.max(1, d.length) } : null;
  }, [data, after9]);

  return (
    <div className="cmp">
      <div className="cmp-head">
        <div>
          <h2>Manual dispatch vs our system · the real day</h2>
          <p className="muted">Each row is a real pickup order. Left: what the dispatcher did by phone that day. Right: what our system suggests {mode === "same" ? "at the same moment the dispatcher decided" : "as soon as the freight was ready"}, using only what was known then.</p>
        </div>
        <div className="cmp-ctl">
          <div className="seg" role="group" aria-label="Which orders">
            <button aria-pressed={after9} onClick={() => setAfter9(true)}>Placed after 9:00</button>
            <button aria-pressed={!after9} onClick={() => setAfter9(false)}>All orders</button>
          </div>
          <div className="seg" role="group" aria-label="Rows">
            <button aria-pressed={scope === "sofar"} onClick={() => setScope("sofar")}>So far ({T != null ? fmtT(T) : "—"})</button>
            <button aria-pressed={scope === "day"} onClick={() => setScope("day")}>Whole day</button>
          </div>
          <div className="seg" role="group" aria-label="When our system decides">
            <button aria-pressed={mode === "ready"} onClick={() => setMode("ready")}>Decide when freight is ready</button>
            <button aria-pressed={mode === "same"} onClick={() => setMode("same")}>Same moment as dispatcher</button>
          </div>
        </div>
      </div>

      {s && (
        <div className="cmp-kpis">
          <div className="card"><div className="lab">Orders decided</div><div className="big">{s.n}</div><div className="muted">{s.n - s.decided} had no truck that could take them (kept as is)</div></div>
          <div className="card"><div className="lab">Picked up earlier</div><div className="big ok">{s.earlier}</div><div className="muted">later: {s.later} · same truck as dispatcher: {s.same_truck}</div></div>
          <div className="card"><div className="lab">Customer wait after ready</div><div className="big">{fmtDur(s.our_wait)} <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>vs {fmtDur(s.manual_wait)}</span></div><div className="muted">average: ours vs manual</div></div>
          <div className="card"><div className="lab">Extra km for these pickups</div><div className="big">{fmtN(s.our_km)} <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>vs {fmtN(s.manual_km)}</span></div><div className="muted">ours vs manual, same travel model</div></div>
        </div>
      )}

      <div className="cmp-filt">
        {[["all", "All"], ["earlier", "Ours earlier"], ["later", "Ours later"], ["same", "Same truck"], ["none", "No option"]].map(([k, l]) => (
          <button key={k} className={"chip" + (filter === k ? " acc" : "")} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <input type="search" placeholder="Search order, address, truck…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 280, marginLeft: "auto" }} />
      </div>

      <div className="cmp-table">
        <table>
          <thead>
            <tr>
              <th>Placed</th><th>Order</th>
              <th className="man">Manual (phone)</th>
              <th className="our">Our system</th>
              <th>Difference</th><th></th>
            </tr>
          </thead>
          <tbody>
            {!data && <tr><td colSpan="6" className="muted">Replaying the day…</td></tr>}
            {data && !rows.length && <tr><td colSpan="6" className="muted">{scope === "sofar" ? "No orders decided yet at this time. Play the clock or switch to Whole day." : "Nothing matches."}</td></tr>}
            {rows.map(r => (
              <tr key={r.pid}>
                <td className="mono">{r.entered > 420 ? fmtT(r.entered) : "before 7:00"}<div className="muted small">ready {r.ready != null ? fmtT(r.ready) : "—"}</div><div className="muted small">decided {fmtT(r.decide)}</div></td>
                <td>
                  <b>{r.a}</b>
                  <div className="muted small">#{r.ordno} · {r.svc}{r.same_day ? " (delivered same day)" : ""} · {fmtN(r.w)} lb · {r.sp} skid{r.sp === 1 ? "" : "s"}{r.se ? " est." : ""}</div>
                </td>
                <td className="man">
                  <b>{r.manual.truck || "—"}</b>
                  <div className="small">given {fmtT(r.manual.given)} · picked up <b>{fmtT(r.manual.pickup)}</b></div>
                  <div className="muted small">waited {fmtDur(r.manual.wait)} · detour {r.manual.km != null ? kmTxt(r.manual.km) : "—"}</div>
                </td>
                <td className="our">
                  {r.ours ? <>
                    <b>{r.ours.truck}</b>{r.ours.same && <span className="chip" style={{ marginLeft: 6 }}>same truck</span>}
                    <div className="small">pickup <b>{fmtT(r.ours.pickup)}</b>{r.ours.drop ? ` · delivers ${fmtT(r.ours.drop)}` : ""}</div>
                    <div className="muted small" title={r.ours.reasons.join("\n")}>waits {fmtDur(r.ours.wait)} · detour {kmTxt(r.ours.km)} · {r.ours.n_ok} {r.ours.n_ok === 1 ? "truck" : "trucks"} could take it</div>
                  </> : <span className="muted small">No truck on the road passed the 3 checks; kept the dispatcher's plan</span>}
                </td>
                <td>
                  {r.ours ? <>
                    <span className={"chip " + (r.gain_min > 15 ? "ok" : r.gain_min < -15 ? "warn" : "")}>{r.gain_min > 15 ? `${fmtDur(r.gain_min)} earlier` : r.gain_min < -15 ? `${fmtDur(-r.gain_min)} later` : "about the same"}</span>
                    <div className="muted small">{r.km_saved >= 0 ? `${kmTxt(r.km_saved)} less driving` : `${kmTxt(-r.km_saved)} more driving`}</div>
                  </> : "—"}
                </td>
                <td><button className="btn small" onClick={() => onOpen(r.pid, r.decide)} title="Jump the clock to this moment and open the order">Open at {fmtT(r.decide)}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ padding: "8px 16px" }}>Manual: real truck and pickup times from Samsara. Ours: our first choice at that moment, taken every time in order (so earlier choices affect later ones). Detours for both use the same travel model. Truck sizes and service cutoffs are Trans Ontario's published values; skid spots are estimated where Elite has none.</p>
    </div>
  );
}
