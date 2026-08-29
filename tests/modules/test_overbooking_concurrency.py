"""Two concurrent transactions race for the last unit; exactly one wins.

Exercises the ``SELECT ... FOR UPDATE`` guard in the inventory ledger, so it
uses real committing connections rather than the rollback fixture.
"""

from __future__ import annotations

import threading
from datetime import date, timedelta

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.errors import NoAvailability
from app.modules.availability.service import service_impl
from tests.factories import make_property, make_rate_plan, make_room_type

TABLES = [
    "avail_inventory_ledger",
    "rate_calendar",
    "rate_restrictions",
    "rate_plan_room_types",
    "rate_plans",
    "inv_rooms",
    "inv_room_types",
    "inv_property",
]


def _truncate(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))


def test_concurrent_last_unit(engine: Engine) -> None:
    try:
        with Session(engine, expire_on_commit=False) as s:
            make_property(s)
            rt = make_room_type(s, code="RACE", rooms=1)
            make_rate_plan(s, [rt])
            s.commit()
            room_type_id = rt.id

        arrival = date.today() + timedelta(days=10)
        departure = arrival + timedelta(days=1)
        barrier = threading.Barrier(2)
        results: list[str] = []
        lock = threading.Lock()

        def worker() -> None:
            outcome = "ok"
            with Session(engine, expire_on_commit=False) as s:
                try:
                    s.begin()
                    barrier.wait(timeout=5)
                    service_impl.reserve(
                        s,
                        room_type_id=room_type_id,
                        arrival=arrival,
                        departure=departure,
                    )
                    s.commit()
                except NoAvailability:
                    s.rollback()
                    outcome = "no_availability"
                except Exception as exc:  # pragma: no cover
                    s.rollback()
                    outcome = f"error:{exc!r}"
            with lock:
                results.append(outcome)

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert sorted(results) == ["no_availability", "ok"], results

        with Session(engine) as s:
            sold = s.execute(
                text(
                    "SELECT sold_units FROM avail_inventory_ledger "
                    "WHERE room_type_id = :rt"
                ),
                {"rt": room_type_id},
            ).scalar_one()
            assert sold == 1
    finally:
        _truncate(engine)
