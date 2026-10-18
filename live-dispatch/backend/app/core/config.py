"""Rules and assumed values. Same numbers as App 1, so both apps agree.
Values marked (assumed) are not in Trans Ontario's data; they are standard values, checked against real loads."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]          # APP_2/
DATA_FILE = ROOT / "data" / "processed" / "sep29.json"
DB_FILE = ROOT / "data" / "processed" / "live.sqlite"
DWELL_FILE = ROOT / "data" / "processed" / "dwell.json"   # on-site time model (scripts/train_dwell.py)
ONSITE_MODE = "standard"     # "standard": 12 min + 3 per skid spot · "learned": predicted from real stops (switch in the dispatcher)
DAY = "2026-09-23"            # default replay day; any day in data/processed/days/ can be picked live
DAYS_DIR = ROOT / "data" / "processed" / "days"

CIRCUITY = 1.4               # road km per straight-line km (calibrated on the sample)
SVC_BASE, SVC_PER_SPOT, SVC_MAX = 12, 3, 60   # minutes at a stop (capped by the free wait time of the truck type)
FILL_MAX = 0.95              # plan floor space to 95% (load bars, securement)
MAX_DUTY = 14 * 60           # Canadian HOS: 14 h on duty in a day
MAX_CYCLE = 70 * 60          # Canadian HOS cycle 1: 70 h on duty in 7 days (past 6 days from Samsara HOS + today)
SKID_IN = (48, 40)           # standard North American skid footprint, inches (one skid spot)
STACK_MAX_H = 48             # stackable freight up to 48 in high can go two high (assumed)
APPT_GRACE = 15              # on time = within 15 min after an appointment
CLOSE = 17 * 60              # customers close 17:00 unless Elite says otherwise
DAY_START = 7 * 60           # orders entered before 07:00 appear at 07:00
WAIT_PER_MIN = 0.5           # cost view only: $ per minute a customer waits after the freight is ready (illustrative)
RANK_MODE = "time"           # "time": rank on wait, extra driving time and km (no prices) · "cost": illustrative $ (toggle)
REGULAR_MIN = 3              # a regular (priority) customer placed at least this many orders in the earlier days of the report
PRIORITY_WEIGHT = {"regular": 1.5, "occasional": 1.2, "new": 1.0}   # how much each minute of waiting counts
LATE_STOP_PEN = 400          # $ per already-late stop pushed later (illustrative)
STALE_MIN = 10               # a Samsara position older than this is stale
TRANSFER_BASE, TRANSFER_PER_SPOT = 20, 3      # minutes to move freight between trucks

# Capacities and free wait time: published by Trans Ontario (trans-ontario.com, GTA trucking).
#   Single-axle straight truck 12 skids / 15,000 lb · Tandem-axle straight 12 skids / 28,000 lb · first 30 min wait free
#   Tandem-axle 53' trailer 26 skids / 44,000 lb · Tri-axle 53' 26 skids / 64,000 lb · first hour free
# The data does not say which axle type each unit is, so we use the lower (safer) weight for each.
# The one cargo van is not on the list: its size is assumed. Cost rates are illustrative.
# Inside height (h_in) is assumed (typical box truck ~96 in, 53' dry van ~108 in). Tailgate: straight trucks have one (website: tailgate service).
CLASSES = {
    "VAN": {"label": "Cargo van", "cap": 2000, "spots": 2, "svc_max": 30, "h_in": 52, "tailgate": False, "per_km": 0.55, "per_hr": 32, "source": "assumed"},
    "ST": {"label": "Straight truck", "cap": 15000, "spots": 12, "svc_max": 30, "h_in": 96, "tailgate": True, "per_km": 1.05, "per_hr": 38, "source": "Trans Ontario (single-axle)"},
    "TT": {"label": "53' trailer", "cap": 44000, "spots": 26, "svc_max": 60, "h_in": 108, "tailgate": False, "per_km": 1.6, "per_hr": 42, "source": "Trans Ontario (tandem-axle)"},
}

# Service levels: published by Trans Ontario. Elite records one on every order (tms_SERVICE).
#   Rush: pickup before 3:30pm · Out of Town: pickup before 1:30pm · Sameday (9am-5pm): order by 12pm, pickup before 5pm
#   Overnight: order by 3:30pm, pickup before 5pm · After Hours (after 4pm): please call in
# LTL is in Elite but not on the website: treated like Overnight (pickup before 5pm). Same-day freight is delivered by 5pm
# unless the delivery has its own appointment (assumed from "Sameday 9am-5pm").
_RUSH = {"label": "Rush", "pickup_by": 15 * 60 + 30, "order_by": None, "same_day": True}
SERVICES = {
    "RUSH": _RUSH, "RUSH90": _RUSH, "EXPEDITE": _RUSH, "90 MINUTES": _RUSH, "NONSTOP": _RUSH, "EXCLUSIVE": _RUSH,
    "SAME DAY": {"label": "Same day", "pickup_by": 17 * 60, "order_by": 12 * 60, "same_day": True},
    "OUT OF TOWN": {"label": "Out of town", "pickup_by": 13 * 60 + 30, "order_by": None, "same_day": False},
    "OVERNIGHT": {"label": "Overnight", "pickup_by": 17 * 60, "order_by": 15 * 60 + 30, "same_day": False},
    "LTL": {"label": "LTL", "pickup_by": 17 * 60, "order_by": 15 * 60 + 30, "same_day": False},
    "AFTER HOURS": {"label": "After hours", "pickup_by": 22 * 60, "order_by": None, "same_day": False, "call_in": True},
}
DEFAULT_SERVICE = {"label": "Standard", "pickup_by": 17 * 60, "order_by": None, "same_day": False}
SAME_DAY_DELIVER_BY = 17 * 60
AFTER_HOURS_FROM = 16 * 60
CONTACT = "gta@trans-ontario.com"   # GTA dispatch email (website); after-hours orders are called in


def service(code):
    return SERVICES.get((code or "").upper().strip(), DEFAULT_SERVICE)


def tier(past):
    return "regular" if past >= REGULAR_MIN else ("occasional" if past > 0 else "new")
