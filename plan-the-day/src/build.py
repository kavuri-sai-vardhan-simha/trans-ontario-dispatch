"""Assemble the single-file app: python build.py <logo.png> [out.html]  (default: ../index.html)"""
import base64, sys, os
d = os.path.dirname(os.path.abspath(__file__))
out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(d, "..", "index.html")
src = open(os.path.join(d, "index.src.html"), encoding="utf-8").read()
logo = "data:image/png;base64," + base64.b64encode(open(sys.argv[1], "rb").read()).decode()
data = open(os.path.join(d, "data.js"), encoding="utf-8").read()
engine = open(os.path.join(d, "engine.js"), encoding="utf-8").read()
out = src.replace("__LOGO__", logo).replace("/*__DATA__*/", data).replace("/*__ENGINE__*/", engine)
open(out_path, "w", encoding="utf-8").write(out)
print("wrote", out_path, len(out), "bytes")
