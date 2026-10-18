import { useEffect, useRef, useState } from "react";

export async function get(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  return r.json();
}
export async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  if (!r.ok) {
    let msg = r.statusText;
    try { const j = await r.json(); msg = typeof j.detail === "string" ? j.detail : (j.detail || []).map(d => d.loc.slice(-1)[0] + ": " + d.msg).join("; "); } catch { /* keep status */ }
    throw new Error(msg);
  }
  return r.json();
}

// Live feed: clock + every truck's position, once a second (Samsara stand-in). Reconnects on its own.
export function useLive() {
  const [snap, setSnap] = useState(null);
  const [online, setOnline] = useState(false);
  useEffect(() => {
    let ws, stop = false, timer;
    const open = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => setOnline(true);
      ws.onmessage = e => {
        const s = JSON.parse(e.data);
        // the dispatcher switched to another real day: reload so every list and map starts from that day
        if (s.clock && s.clock.day) { if (useLive.day && useLive.day !== s.clock.day) { location.reload(); return; } useLive.day = s.clock.day; }
        setSnap(s);
      };
      ws.onclose = () => { setOnline(false); if (!stop) timer = setTimeout(open, 1500); };
      ws.onerror = () => ws.close();
    };
    open();
    return () => { stop = true; clearTimeout(timer); ws && ws.close(); };
  }, []);
  return { snap, online };
}

// Re-fetch something whenever the trigger value changes (and every `ms` as a fallback)
export function useFetch(path, trigger, ms = 5000) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const seq = useRef(0);
  useEffect(() => {
    if (!path) { setData(null); return; }
    let alive = true; const my = ++seq.current;
    const load = () => get(path).then(d => { if (alive && my === seq.current) { setData(d); setErr(null); } }).catch(e => alive && setErr(e.message));
    load();
    const id = setInterval(load, ms);
    return () => { alive = false; clearInterval(id); };
  }, [path, trigger, ms]);
  return [data, err, setData];
}
