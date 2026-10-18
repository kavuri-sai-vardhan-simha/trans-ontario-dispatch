"""Let people in the room open the phone booking page (QR on the dispatcher screen).

Two ways to reach this laptop:
  1. Same Wi-Fi: http://<laptop IP>:8000  (works unless the Wi-Fi blocks devices from seeing each other)
  2. Public link through a free Cloudflare quick tunnel (no account): if cloudflared(.exe) is in the APP_2 folder
     or on the PATH, it is started automatically and its https://....trycloudflare.com link is used for the QR.
Set TUNNEL=0 to switch the tunnel off.
"""
from __future__ import annotations
import os, re, secrets, shutil, socket, subprocess, threading
from pathlib import Path

STATE = {"public": None, "tunnel": "off", "why": None}
# The public link opens only the booking page. The team's own full-demo link carries this key.
STAFF_KEY = os.environ.get("STAFF_KEY") or secrets.token_urlsafe(9)
PORT = int(os.environ.get("PORT", "8000"))
ROOT = Path(__file__).resolve().parents[3]


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(("8.8.8.8", 80)); ip = s.getsockname()[0]; s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def _find():
    for name in ("cloudflared.exe", "cloudflared"):
        p = ROOT / name
        if p.exists():
            return str(p)
    return shutil.which("cloudflared")


def start_tunnel():
    if os.environ.get("TUNNEL", "1") == "0":
        STATE.update(tunnel="off", why="TUNNEL=0"); return
    exe = _find()
    if not exe:
        STATE.update(tunnel="missing", why="cloudflared not found (optional)"); return
    try:
        p = subprocess.Popen([exe, "tunnel", "--no-autoupdate", "--url", f"http://localhost:{PORT}"],
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    except OSError as e:
        STATE.update(tunnel="error", why=str(e)); return
    STATE.update(tunnel="starting")

    def read():
        for line in p.stdout:
            # cloudflared also prints its own service address (api.trycloudflare.com): skip it, keep the tunnel's
            m = re.search(r"https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com", line)
            if m and not STATE["public"]:
                STATE.update(public=m.group(0), tunnel="on")
            elif "failed to request quick tunnel" in line.lower() and not STATE["public"]:
                STATE.update(tunnel="error", why="Cloudflare could not open a public link from this network")
        STATE.update(tunnel="stopped")
    threading.Thread(target=read, daemon=True).start()


def links():
    lan = f"http://{lan_ip()}:{PORT}"
    staff = f"{STATE['public']}/staff?key={STAFF_KEY}" if STATE["public"] else None
    return {"public": STATE["public"], "lan": lan, "best": STATE["public"] or lan, "tunnel": STATE["tunnel"], "why": STATE["why"], "staff": staff}
