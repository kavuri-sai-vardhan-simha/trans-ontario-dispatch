import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const dark = () => {
  const t = document.documentElement.getAttribute("data-theme");
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fillCol = f => (f >= 0.9 ? css("--crit") : f >= 0.7 ? css("--warn") : css("--ok"));

// Lake Ontario (rough outline): a line between the Niagara side and the Toronto side that would cross it is drawn
// around the west end (Hamilton / Burlington), like the real road.
const LAKE = [[43.30,-79.78],[43.38,-79.70],[43.47,-79.61],[43.545,-79.52],[43.60,-79.43],[43.62,-79.37],[43.64,-79.30],[43.67,-79.22],[43.75,-79.12],[43.80,-78.98],[43.84,-78.80],[43.88,-78.50],[43.93,-78.10],[43.97,-77.50],
  [43.27,-77.50],[43.30,-78.50],[43.30,-79.05],[43.27,-79.25],[43.27,-79.55],[43.29,-79.72]];
const inLake = (lat, lng) => { let c = false; for (let i = 0, j = LAKE.length - 1; i < LAKE.length; j = i++) { const [y1, x1] = LAKE[i], [y2, x2] = LAKE[j]; if ((y1 > lat) !== (y2 > lat) && lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1) c = !c; } return c; };
const south = p => p[0] < 43.33;
export const aroundLake = pts => {
  const out = [];
  pts.forEach((p, i) => {
    if (i) { const a = pts[i - 1];
      if (south(a) !== south(p) && [0.2, 0.35, 0.5, 0.65, 0.8].some(f => inLake(a[0] + (p[0] - a[0]) * f, a[1] + (p[1] - a[1]) * f)))
        out.push(...(south(a) ? [[43.25, -79.82], [43.35, -79.80]] : [[43.35, -79.80], [43.25, -79.82]])); }
    out.push(p);
  });
  return out;
};

/* Street map shared by the apps.
   trucks : [[u, lat, lng, status, fill, src], ...] from the live feed
   pins   : [{id, lat, lng, kind: "order"|"pickup"|"drop"|"depot"|"site", label, hot}]
   lines  : [{pts: [[lat,lng],...], color, dash, weight}]
   focus  : truck indexes to highlight (others are dimmed) */
export default function LiveMap({ trucks = [], names = {}, pins = [], lines = [], focus = null, onTruck, onPin, onMapClick, fitKey, fitPts, center = [43.75, -79.45], zoom = 10 }) {
  const el = useRef(null), map = useRef(null), layers = useRef({}), tmarks = useRef(new Map());
  const cb = useRef({}); cb.current = { onTruck, onPin, onMapClick };

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, preferCanvas: false }).setView(center, zoom);
    // OpenStreetMap standard tiles (free, attribution required). Dark mode inverts them in CSS.
    const tiles = () => L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    layers.current.tiles = tiles().addTo(m);
    layers.current.lines = L.layerGroup().addTo(m);
    layers.current.pins = L.layerGroup().addTo(m);
    layers.current.trucks = L.layerGroup().addTo(m);
    map.current = m;
    m.on("click", e => cb.current.onMapClick && cb.current.onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }));
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const swap = () => { m.removeLayer(layers.current.tiles); layers.current.tiles = tiles().addTo(m); layers.current.tiles.bringToBack(); };
    mq.addEventListener("change", swap);
    const ro = new ResizeObserver(() => m.invalidateSize()); ro.observe(el.current);
    return () => { mq.removeEventListener("change", swap); ro.disconnect(); m.remove(); };
  }, []);

  // trucks: update in place every tick
  useEffect(() => {
    const g = layers.current.trucks; if (!g) return;
    const seen = new Set();
    for (const [u, lat, lng, status, fill, src] of trucks) {
      if (status === "before" || status === "done") { const mk = tmarks.current.get(u); if (mk) { g.removeLayer(mk); tmarks.current.delete(u); } continue; }
      seen.add(u);
      const hi = focus && focus.includes(u), dim = focus && !hi;
      const col = status === "down" ? css("--crit") : status === "held" ? css("--warn") : fillCol(fill);
      const size = hi ? 18 : 12;
      const html = `<div class="tmark" style="width:${size}px;height:${Math.round(size * 0.72)}px;background:${col};opacity:${dim ? 0.3 : 1};${hi ? "border-width:2.5px;" : ""}${src !== "Samsara" ? "border-style:dashed;" : ""}"></div>`
        + (hi ? `<div style="position:absolute;left:${size + 4}px;top:-3px;white-space:nowrap;font:700 11px Montserrat,sans-serif;color:${css("--ink")};text-shadow:0 0 3px ${css("--surface")},0 0 3px ${css("--surface")}">${names[u] || ""}</div>` : "")
        + (status === "down" ? `<div style="position:absolute;left:-3px;top:-14px;font:700 13px sans-serif">⚠</div>` : "");
      const icon = L.divIcon({ className: "", html, iconSize: [size, size * 0.72], iconAnchor: [size / 2, size * 0.36] });
      let mk = tmarks.current.get(u);
      if (!mk) {
        mk = L.marker([lat, lng], { icon, keyboard: false, zIndexOffset: hi ? 1000 : 0 }).addTo(g);
        mk.on("click", () => cb.current.onTruck && cb.current.onTruck(u));
        mk.bindTooltip(() => names[u] || "", { direction: "top", offset: [0, -6] });
        tmarks.current.set(u, mk);
      } else {
        mk.setLatLng([lat, lng]); mk.setIcon(icon); mk.setZIndexOffset(hi ? 1000 : 0);
      }
    }
    for (const [u, mk] of tmarks.current) if (!seen.has(u)) { g.removeLayer(mk); tmarks.current.delete(u); }
  }, [trucks, focus, names]);

  useEffect(() => {
    const g = layers.current.pins; if (!g) return; g.clearLayers();
    for (const p of pins) {
      const col = p.kind === "depot" ? css("--accent") : p.kind === "drop" ? css("--ok") : p.kind === "site" ? css("--crit") : css("--warn");
      let html;
      if (p.kind === "depot") html = `<div style="width:14px;height:14px;background:${col};border:2px solid ${css("--surface")};box-shadow:0 0 0 1px ${col}"></div>`;
      else html = `<svg width="${p.hot ? 26 : 18}" height="${p.hot ? 34 : 24}" viewBox="0 0 18 24"><path d="M9 23 C9 23 1 13.5 1 8.5 A8 8 0 0 1 17 8.5 C17 13.5 9 23 9 23Z" fill="${col}" stroke="${css("--surface")}" stroke-width="1.5"/><circle cx="9" cy="8.5" r="3" fill="${css("--surface")}"/></svg>`;
      const w = p.kind === "depot" ? 14 : p.hot ? 26 : 18, h = p.kind === "depot" ? 14 : p.hot ? 34 : 24;
      const mk = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", html, iconSize: [w, h], iconAnchor: p.kind === "depot" ? [7, 7] : [w / 2, h] }), zIndexOffset: p.hot ? 2000 : 500 }).addTo(g);
      if (p.label) mk.bindTooltip(p.label, { direction: "top", offset: [0, p.kind === "depot" ? -6 : -h], permanent: !!p.hot });
      mk.on("click", () => cb.current.onPin && cb.current.onPin(p));
    }
  }, [pins]);

  useEffect(() => {
    const g = layers.current.lines; if (!g) return; g.clearLayers();
    const col = c => (c && c.startsWith("var(") ? css(c.slice(4, -1)) : c);
    for (const l of lines) L.polyline(aroundLake(l.pts), { color: col(l.color) || css("--accent"), weight: l.weight || 3, opacity: l.opacity || 0.85, dashArray: l.dash || null }).addTo(g);
  }, [lines]);

  useEffect(() => {
    if (!map.current || !fitPts || !fitPts.length) return;
    if (fitPts.length === 1) map.current.setView(fitPts[0], Math.max(map.current.getZoom(), 12), { animate: true });
    else map.current.fitBounds(L.latLngBounds(fitPts).pad(0.25), { animate: true, maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return <div ref={el} style={{ position: "absolute", inset: 0 }} />;
}
