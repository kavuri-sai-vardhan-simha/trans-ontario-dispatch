"""Our own small store (SQLite). It is NOT a second order system: Elite keeps the orders.
We keep only our layer: bookings received through the portal, dispatcher decisions,
driver space reports and the sync log, so a restart picks up where it left off."""
from __future__ import annotations
import json, sqlite3, threading


class Store:
    def __init__(self, path):
        self.lock = threading.Lock()
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.executescript("""
        create table if not exists bookings (id integer primary key, ordno text, body text, t real);
        create table if not exists decisions (id integer primary key, pid integer, body text, t real);
        create table if not exists reports (id integer primary key, u integer, kind text, body text, t real);
        create table if not exists events (id integer primary key, t real, kind text, body text);
        """)

    def add(self, table, **row):
        with self.lock:
            cols = ",".join(row); qs = ",".join("?" * len(row))
            vals = [json.dumps(v) if isinstance(v, (dict, list)) else v for v in row.values()]
            cur = self.db.execute(f"insert into {table} ({cols}) values ({qs})", vals)
            self.db.commit()
            return cur.lastrowid

    def all(self, table):
        with self.lock:
            cur = self.db.execute(f"select * from {table} order by id")
            names = [c[0] for c in cur.description]
            out = []
            for r in cur.fetchall():
                d = dict(zip(names, r))
                if "body" in d:
                    d["body"] = json.loads(d["body"])
                out.append(d)
            return out

    def clear(self):
        with self.lock:
            for t in ("bookings", "decisions", "reports", "events"):
                self.db.execute(f"delete from {t}")
            self.db.commit()
