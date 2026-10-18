import { useEffect, useState } from "react";
import { setLang } from "./i18n.js";

const store = {
  get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: fine */ } },
};

function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
}

// Call once before rendering: applies the saved theme and language (shared by all three apps on this device)
export function initPrefs() {
  applyTheme(store.get("to.theme", "auto"));
  const l = store.get("to.lang", "en");
  if (l === "fr") setTimeout(() => setLang("fr"), 0);
}

/* Theme (Auto / Light / Dark) and language (EN / FR) switch. `onDark` styles it for a dark or coloured header. */
export default function Prefs({ onDark = false }) {
  const [theme, setTheme] = useState(() => store.get("to.theme", "auto"));
  const [lang, setL] = useState(() => store.get("to.lang", "en"));
  useEffect(() => { applyTheme(theme); store.set("to.theme", theme); }, [theme]);
  useEffect(() => { setLang(lang); store.set("to.lang", lang); }, [lang]);
  const next = { auto: "light", light: "dark", dark: "auto" }[theme];
  const icon = theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐";
  const label = { auto: "Auto", light: "Light", dark: "Dark" }[theme];
  const base = { border: "1px solid " + (onDark ? "rgba(255,255,255,.55)" : "var(--line)"), background: "transparent", color: onDark ? "#fff" : "var(--ink)",
    borderRadius: 8, padding: "5px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer", minHeight: 32, display: "inline-flex", alignItems: "center", gap: 6 };
  const on = { ...base, background: onDark ? "#fff" : "var(--ink)", color: onDark ? "#1F4AEE" : "var(--bg)" };
  return (
    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <button style={base} onClick={() => setTheme(next)} title="Theme" aria-label={`Theme: ${label}`}><span aria-hidden="true">{icon}</span>{label}</button>
      <span style={{ display: "inline-flex" }} role="group" aria-label="Language">
        <button style={{ ...(lang === "en" ? on : base), borderRadius: "8px 0 0 8px" }} aria-pressed={lang === "en"} onClick={() => setL("en")} translate="no">EN</button>
        <button style={{ ...(lang === "fr" ? on : base), borderRadius: "0 8px 8px 0", borderLeft: 0 }} aria-pressed={lang === "fr"} onClick={() => setL("fr")} translate="no">FR</button>
      </span>
    </div>
  );
}
