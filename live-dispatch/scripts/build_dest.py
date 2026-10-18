"""Final destination (consignee) of every pickup order, from the routing report's Elite fields.

Usage:  python build_dest.py <routing-report.xlsx> <out.json>
Writes {order number: {"name", "a", "city", "prov"}} so the dispatcher sees where each pickup is going.
"""
import json, sys
import pandas as pd
L = pd.read_excel(sys.argv[1], sheet_name="order_legs") if sys.argv[1].endswith(".xlsx") else pd.read_pickle(sys.argv[1])
out = {}
def s(v): return "" if pd.isna(v) else str(v).strip()
for _, r in L.iterrows():
    k = str(r["ordno"])
    if k in out or not s(r.get("tms_RC_CITY")):
        continue
    street = " ".join(x for x in (s(r.get("tms_RC_STRNO")), s(r.get("tms_RC_STREET")).title()) if x)
    out[k] = {"name": s(r.get("tms_RC_NAME")), "a": street, "city": s(r.get("tms_RC_CITY")).title(), "prov": s(r.get("tms_RC_PROV"))}
json.dump(out, open(sys.argv[2], "w"), separators=(",", ":"))
print(len(out), "orders")
