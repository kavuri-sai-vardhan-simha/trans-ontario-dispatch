import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { get } from "../../shared/api.js";

/* Live demo: a QR so people in the room can book a pickup from their phone (Web Dispatch stand-in).
   Two tabs: the public link (any network) and the laptop's Wi-Fi address. Both open the booking page only. */
export default function AudienceQR({ onClose }) {
  const [s, setS] = useState(null), [tab, setTab] = useState("public"), [img, setImg] = useState({});
  useEffect(() => { const load = () => get("/api/share").then(setS).catch(() => {}); load(); const id = setInterval(load, 4000); return () => clearInterval(id); }, []);
  const urls = { public: s && s.public ? s.public + "/book" : null, wifi: s ? s.lan + "/book" : null };
  useEffect(() => {
    for (const k of ["public", "wifi"]) if (urls[k]) QRCode.toDataURL(urls[k], { width: 520, margin: 1, errorCorrectionLevel: "M" }).then(d => setImg(x => ({ ...x, [k]: d })));
  }, [urls.public, urls.wifi]);
  const info = {
    public: s && s.public ? "Works on any phone, on mobile data or any Wi-Fi."
      : s && s.tunnel === "starting" ? "Starting the public link… a few seconds."
      : s && (s.tunnel === "error" || s.tunnel === "stopped") ? "Cloudflare couldn't open a public link from this network. Use the Wi-Fi tab, or connect the laptop to a phone hotspot and restart."
      : "Not available: cloudflared.exe isn't in the APP_2 folder. Use the Wi-Fi tab.",
    wifi: "Phones must be on the same Wi-Fi as this laptop.",
  };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Book from your phone" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="box" style={{ maxWidth: 560, justifyItems: "center", textAlign: "center", gap: 14 }}>
        <div className="seg" role="tablist" aria-label="Link type">
          <button role="tab" aria-pressed={tab === "public"} aria-selected={tab === "public"} onClick={() => setTab("public")}>Public link</button>
          <button role="tab" aria-pressed={tab === "wifi"} aria-selected={tab === "wifi"} onClick={() => setTab("wifi")}>Same Wi-Fi</button>
        </div>
        <h2 style={{ fontSize: 26, margin: 0 }}>Book a pickup from your phone</h2>
        <p className="muted" style={{ margin: 0, maxWidth: 440 }}>{info[tab]}</p>
        {urls[tab] && img[tab] ? <img src={img[tab]} alt="QR code for the booking page" style={{ width: "min(400px, 78vw)", height: "auto", background: "#fff", padding: 10, borderRadius: 12 }} />
          : urls[tab] ? <span className="muted">Making the code…</span> : null}
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
