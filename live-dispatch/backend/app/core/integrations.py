"""Stand-ins for Trans Ontario's existing systems.

In production these call the real systems; in the prototype they record what would be sent,
so the dispatcher can see every write-back in the sync log.
  Elite TMS  : orders (P and D legs), driver/unit on the pickup leg (PKDRVR / PKUNIT)
  Samsara    : truck GPS and the driver's route (new stop inserted, driver app notified)
Nothing here replaces either system: Elite stays the order record, Samsara stays tracking and the driver app.
"""
from __future__ import annotations
import itertools


class EliteStub:
    def __init__(self, first_order=3100001):
        self._next = itertools.count(first_order)

    def create_order(self, booking: dict) -> dict:
        n = next(self._next)
        return {"ordno": str(n), "legs": [f"{n}P", f"{n}D"],
                "msg": f"Elite: new order {n} created from {booking['channel']} (P leg {booking['shipper']['name']}, D leg {booking['consignee']['name']})"}

    def assign_pickup(self, ordno: str, truck: dict) -> str:
        return f"Elite: order {ordno} P leg → driver {truck['code']} ({truck['name']}), unit {truck['veh']}"

    def unassign_pickup(self, ordno: str) -> str:
        return f"Elite: order {ordno} P leg driver cleared"


class SamsaraStub:
    def insert_stop(self, truck: dict, stop_addr: str, eta: str) -> str:
        return f"Samsara: route of {truck['veh']} updated, new pickup at {stop_addr} (ETA {eta}); driver app notified"

    def remove_stop(self, truck: dict, stop_addr: str) -> str:
        return f"Samsara: pickup at {stop_addr} removed from {truck['veh']}'s route"
