export const fmtT = m => {
  if (m == null || isNaN(m)) return "—";
  m = Math.round(m);
  if (m < 0) return "yesterday " + fmtT(m + 1440);      // e.g. freight ready the day before
  const h = Math.floor(m / 60), mm = ((m % 60) + 60) % 60;
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
};
export const fmtN = n => (n == null ? "—" : Math.round(n).toLocaleString("en-CA"));
export const fmtDur = m => {
  if (m == null) return "—"; m = Math.max(0, Math.round(m));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
};
export const kmTxt = km => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
export const STATUS = {
  moving: "Driving", stop: "At a stop", before: "Not started", done: "Finished", home: "Heading to depot", down: "Stopped", held: "Waiting for spare driver",
};
export const fillColor = f => (f >= 0.9 ? "var(--crit)" : f >= 0.7 ? "var(--warn)" : "var(--ok)");

// "2026-09-29" -> "Tue Sep 29" (the real day being replayed)
export const fmtDay = d => { if (!d) return ""; const x = new Date(d + "T12:00:00"); return x.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" }).replace(/\./g, ""); };
