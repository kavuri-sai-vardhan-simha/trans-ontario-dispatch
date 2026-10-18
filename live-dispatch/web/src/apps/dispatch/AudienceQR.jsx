import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { get } from "../../shared/api.js";

/* Live demo: a big QR so people in the room can book a pickup from their phone (Web Dispatch stand-in).
   Their orders arrive here as new orders from Elite, tagged 📱. */
export default function AudienceQR({ onClose }) {
  const [s, setS] = useState(null), [img, setImg] = useState(null), [which, setWhich] = useState("best");
  useEffect(() => { const load = () => get("/api/share").then(setS).catch(() => {}); load(); const id = setInterval(load, 4000); return () => clearInterval(id); }, []);
  const url = s ? (which === "lan" ? s.lan : s.best) + "/book" : null;
  useEffect(() => { if (url) QRCode.toDataURL(url, { width: 520, margin: 1, errorCorrectionLevel: "M" }).then(setImg); }, [url]);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Book from your phone" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="box" style={{ maxWidth: 640, justifyItems: "center", textAlign: "center" }}>
        <span className="lab">Live demo</span>
        <h2 style={{ fontSize: 26 }}>Book a pickup from your phone</h2>
        <p className="muted" style={{ margin: 0 }}>Scan, drop a pin, press Book. Watch it arrive here and get a truck.</p>
        {img ? <img src={img} alt={`QR code for ${url}`} style={{ width: "min(440px, 80vw)", height: "auto", background: "#fff", padding: 10, borderRadius: 12 }} /> : <span className="muted">Making the code…</span>}
        {url && <code style={{ fontSize: 15, wordBreak: "break-all" }}>{url}</code>}
        {s && <div className="muted" style={{ fontSize: 12.5 }}>
          {s.public ? "Public link (works on mobile data and any Wi-Fi)." : s.tunnel === "starting" ? "Starting the public link… (a few seconds)" : "Same Wi-Fi only. For a public link, put cloudflared.exe in the APP_2 folder and restart."}
          {s.public && <> · <a href="#" onClick={e => { e.preventDefault(); setWhich(which === "lan" ? "best" : "lan"); }}>{which === "lan" ? "use the public link" : "use the Wi-Fi link"}</a></>}
          <br />{s.audience} order{s.audience === 1 ? "" : "s"} from the audience so far · max 3 per phone
        </div>}
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
