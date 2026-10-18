import { useEffect, useState } from "react";
import { get, post } from "../../shared/api.js";
import { fmtT, fmtN, fmtDur, kmTxt } from "../../shared/fmt.js";

/* Shown when nothing is selected: quick wins right now, and how the whole day compares with what really happened. */
export default function Overview({ gaps, waiting, onOrder, flash, costOn }) {
  const [mode, setMode] = useState("ready");
  const [wait, setWait] = useState(0.5);
  const [cmp, setCmp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState(null);
  const [onsite, setOnsite] = useState("standard");
  useEffect(() => { get("/api/settings").then(s => setOnsite(s.onsite || "standard")).catch(() => {}); }, []);
  const pickOnsite = v => { setOnsite(v); post("/api/settings", { onsite: v }).then(() => setCmp(null)).catch(() => {}); };
  useEffect(() => { get("/api/rules").then(setRules).catch(() => {}); }, [cmp]);

  useEffect(() => {
    let alive = true; setLoading(true);
    const id = setTimeout(() => get(`/api/compare?mode=${mode}&wait=${wait}&r=${costOn ? "c" : "t"}&o=${onsite}`).then(d => alive && setCmp(d)).catch(e => flash(e.message)).finally(() => alive && setLoading(false)), 250);
    return () => { alive = false; clearTimeout(id); };
  }, [mode, wait, costOn, onsite]);
  const saveWait = v => { setWait(v); post("/api/settings", { wait_per_min: v }).catch(() => {}); };

  return (
    <>
      <div className="dh">
        <span className="lab">Right now</span>
        <h2>{waiting.length ? `${waiting.length} pickups need a truck` : "Every pickup has a truck"}</h2>
        <p className="muted">Pick an order on the left or a pin on the map to see the best trucks and why.</p>
      </div>

      <div className="sec">
        <h3>Fill the gaps <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>a truck already passing, ≤ 5 km extra</span></h3>
        {!gaps && <span className="muted">Checking…</span>}
        {gaps && !gaps.length && <span className="muted">No easy matches at this moment.</span>}
        {(gaps || []).slice(0, 8).map(g => (
          <div key={g.pid} className="row" style={{ border: "1px solid var(--line)", borderRadius: 8 }} onClick={() => onOrder(g.pid)}>
            <div className="l1"><span className="t1">{g.a}</span><span className="chip ok">+{kmTxt(g.km)}</span></div>
            <div className="t2">{g.veh} can pick up at {fmtT(g.arr)} · {fmtN(g.w)} lb</div>
          </div>
        ))}
      </div>

      <div className="sec">
        <h3>Whole day vs what really happened</h3>
        <div className="seg" role="group" aria-label="Time at each stop">
          <button aria-pressed={onsite === "standard"} onClick={() => pickOnsite("standard")} title="12 min + 3 min per skid spot">Stop time: standard</button>
          <button aria-pressed={onsite === "learned"} onClick={() => pickOnsite("learned")} title="Predicted from 1,478 real stops; tested on days it never saw">Stop time: learned (AI)</button>
        </div>
        <div className="seg" role="group" aria-label="When we decide">
          <button aria-pressed={mode === "ready"} onClick={() => setMode("ready")}>Decide when freight is ready</button>
          <button aria-pressed={mode === "same"} onClick={() => setMode("same")}>Same moment as dispatcher</button>
        </div>
        {costOn && <label className="f">Priority: fewer km ↔ earlier pickups <small>Customer wait counted at ${wait.toFixed(1)} per minute (illustrative)</small>
          <input type="range" min="0" max="3" step="0.5" value={wait} onChange={e => saveWait(+e.target.value)} />
        </label>}
        {cmp && (
          <div style={{ display: "grid", gap: 8, opacity: loading ? 0.5 : 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div className="card"><div className="lab">Picked up earlier</div><div className="big ok">{cmp.earlier}</div><div className="muted" style={{ fontSize: 12 }}>of {cmp.decided} · later: {cmp.later}</div></div>
              <div className="card"><div className="lab">Typical gain</div><div className="big">{fmtDur(Math.max(0, cmp.median_earlier_min))}</div><div className="muted" style={{ fontSize: 12 }}>{Math.round(cmp.hours_earlier)} truck-hours sooner in total</div></div>
              <div className="card"><div className="lab">Extra km for pickups</div><div className="big">{fmtN(cmp.our_km)}</div><div className="muted" style={{ fontSize: 12 }}>real dispatch: {fmtN(cmp.real_km)} km</div></div>
              <div className="card"><div className="lab">Same truck as dispatcher</div><div className="big">{cmp.same_truck}</div><div className="muted" style={{ fontSize: 12 }}>{cmp.kept} had no option (kept as is)</div></div>
            </div>
            <p className="muted" style={{ fontSize: 11.5 }}>Replays all {cmp.n} pickups given out during the day, taking our first choice each time. Real stop times come from Samsara; our times use the same travel model as App 1. Truck sizes and free wait times are Trans Ontario's published ones (safer single-axle / tandem limits); prices are illustrative.</p>
          </div>
        )}
      </div>

      {cmp && rules && (
        <div className="sec">
          <h3>Success scorecard <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>what the case study measures</span></h3>
          <table className="score"><tbody>
            <tr><th>Delivery reliability</th><td>{cmp.earlier} of {cmp.decided} pickups earlier, {cmp.later} later; no assignment makes an on-time stop late</td></tr>
            <tr><th>Operational cost</th><td>{fmtN(cmp.our_km)} km for pickups vs {fmtN(cmp.real_km)} km real{costOn ? "" : " (turn on Cost to trade km for wait)"}</td></tr>
            <tr><th>Fleet capacity use</th><td>Trucks on the road are {rules.fill_now}% full right now; free space is shown live on every truck</td></tr>
            <tr><th>Faster response</th><td>{rules.decide_ms} ms to check all {rules.trucks} trucks for one order{rules.stress ? `; ${rules.stress.orders} orders in a day: ${rules.stress.ms_median} ms each (max ${rules.stress.ms_max} ms)` : ""}</td></tr>
            <tr><th>Trust</th><td>Every choice shows its reasons, the ruled-out trucks and why; the dispatcher always decides</td></tr>
            <tr><th>Feasible plans</th><td>Room, cutoffs, appointments, 14 h day and 70 h week, equipment and height are hard rules: never broken</td></tr>
          </tbody></table>
        </div>
      )}

      <div className="sec">
        <h3>How a truck is chosen</h3>
        <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, fontSize: 12.5 }}>
          <li><b>Room</b>: weight and floor spots on board now (Elite orders) stay under the truck's size until the depot.</li>
          <li><b>In time</b>: picked up before the service cutoff (Rush 15:30, Out of town 13:30, Same day / Overnight 17:00). Rush and Same day orders are also delivered by the same truck today.</li>
          <li><b>Everyone else on time</b>: its other stops keep their appointment (or 17:00), driver under 14 h.</li>
          <li><b>Rank</b>: shortest customer wait (regular customers first), then least extra driving time and km. No prices unless you turn on Cost view. You decide; nothing is sent until you click Assign.</li>
        </ol>
        {rules && <details><summary className="muted" style={{ cursor: "pointer", fontSize: 12.5, marginTop: 6 }}>All rules checked ({rules.rules.filter(r => r.status === "checked").length} checked, {rules.rules.filter(r => r.status !== "checked").length} simplified)</summary>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {rules.rules.map(r => <div key={r.area} style={{ fontSize: 12.5 }}><span className={"chip " + (r.status === "checked" ? "ok" : "warn")}>{r.status}</span> <b>{r.area}</b>: <span className="muted">{r.how}</span></div>)}
          </div>
        </details>}
      </div>
    </>
  );
}
