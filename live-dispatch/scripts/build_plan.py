"""Make the 'Plan the day' screen from App 1 (whole-day planner + audit of the real dispatch).
Usage: python scripts/build_plan.py [path to App/index.html]   (default: ../App/index.html)
Writes web/public/plan.html, which the build copies to web/dist/plan.html (served at /plan)."""
import os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "..", "App", "index.html")
t = open(src, encoding="utf-8").read()
theme = ('<script>try{var t=localStorage.getItem("to.theme");'
         'if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>\n')
link = '<div class="status" id="status"></div>\n    <a class="btn" href="/dispatch" title="Back to the live day">Live dispatch</a>'
assert t.count('<div class="status" id="status"></div>') == 1
t = theme + t.replace('<title>Trans Ontario Dispatch Copilot</title>', '<title>Plan the day · Trans Ontario</title>', 1)
t = t.replace('<div class="status" id="status"></div>', link, 1)
t = t.replace('<div class="prod">Dispatch Copilot<small>prototype</small></div>', '<div class="prod">Plan the day<small>whole-day plan · problems · disruptions</small></div>', 1)
out = os.path.join(root, "web", "public", "plan.html")
open(out, "w", encoding="utf-8").write(t)
print("wrote", out, len(t), "bytes")
