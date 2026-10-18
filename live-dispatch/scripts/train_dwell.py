"""Predict how long a truck spends at a stop (on-site / dwell minutes), learned from Trans Ontario's real stops.

Training: every customer stop in the routing report BEFORE the replay day (Sep 21-28).
Test: the days AFTER it (Sep 30 - Oct 3), which the model never saw. We report the error against
the flat rule we used before (12 min + 3 min per skid spot, capped at the free wait time).

Model (simple and explainable, no black box):
  base  = median on-site time for that kind of stop (pickup / delivery) and freight size (skid spots bucket)
  if the address has past visits of that kind: blend their median with the base, weighted by how many visits
          prediction = (address median x visits + base x 3) / (visits + 3)
Usage: python scripts/train_dwell.py <routing-report.xlsx> [out.json]   (default data/processed/dwell.json)
"""
import json, os, re, sys
import pandas as pd

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "processed", "dwell.json")
DAY = "2026-09-29"
S = pd.read_excel(SRC, sheet_name="stops")
S = S[(S.stop_type == "customer") & S.kind.isin(["PICKUP", "DROP-OFF"]) & S.dwell_min.notna()].copy()
S["d"] = S.service_date.astype(str).str[:10]
S = S[(S.dwell_min >= 0) & (S.dwell_min <= 240)]            # drop GPS anomalies (negative or > 4 h)
S["k"] = S.kind.map({"PICKUP": "P", "DROP-OFF": "D"})
S["sp"] = S.skid_spots.where(S.skid_spots > 0, S.pieces.clip(upper=26)).fillna(1).clip(0.25, 26)


def addr_key(a):
    return re.sub(r"\s+", " ", str(a or "")).strip().upper()


def bucket(sp):
    return "1" if sp <= 1 else "2-3" if sp <= 3 else "4-7" if sp <= 7 else "8+"


S["ak"] = S.address.map(addr_key); S["b"] = S.sp.map(bucket)
train, test = S[S.d < DAY], S[S.d > DAY]


K = 3          # how many visits before an address's own history counts as much as the base


def fit(df):
    by_addr = {f"{k}|{a}": [round(float(g.dwell_min.median()), 1), int(len(g))] for (k, a), g in df.groupby(["k", "ak"])}
    by_bucket = {f"{k}|{b}": [round(float(g.dwell_min.median()), 1), int(len(g))] for (k, b), g in df.groupby(["k", "b"])}
    return {"k": K, "by_addr": by_addr, "by_bucket": by_bucket}


def predict(M, k, a, sp):
    base = (M["by_bucket"].get(f"{k}|{bucket(sp)}") or [15.0, 0])[0]
    h = M["by_addr"].get(f"{k}|{addr_key(a)}")
    if h:
        return (h[0] * h[1] + base * M["k"]) / (h[1] + M["k"]), "address", h[1]
    return base, "size", 0


def flat(sp):
    return min(30, 12 + 3 * sp)


M = fit(train)
rows = [(r.dwell_min, *predict(M, r.k, r.address, r.sp), flat(r.sp), r.sp) for r in test.itertuples()]
n = len(rows)
mae = lambda i: sum(abs(x[0] - x[i]) for x in rows) / n
bias = lambda i: sum(x[0] - x[i] for x in rows) / n
big = [x for x in rows if x[5] >= 4]
metrics = {"train_days": sorted(train.d.unique().tolist()), "test_days": sorted(test.d.unique().tolist()),
           "n_train": int(len(train)), "n_test": n,
           "mae_model": round(mae(1), 1), "mae_flat": round(mae(4), 1), "better_pct": round(100 * (1 - mae(1) / mae(4))),
           "bias_model": round(bias(1), 1), "bias_flat": round(bias(4), 1),
           "mae_big_model": round(sum(abs(x[0] - x[1]) for x in big) / len(big), 1), "mae_big_flat": round(sum(abs(x[0] - x[4]) for x in big) / len(big), 1),
           "n_big": len(big), "test_by_source": pd.Series([x[2] for x in rows]).value_counts().to_dict()}
# the live model learns from every day before the replay day (the same days as above)
# the model used live is trained on every day up to and including the replay day's past (all days before DAY)
M["metrics"] = metrics
json.dump(M, open(OUT, "w"), separators=(",", ":"))
print(json.dumps(metrics, indent=1))
