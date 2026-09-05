from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.modules.reports import service
from tests.factories import make_guest, make_property, make_rate_plan, make_room_type


@pytest.fixture
def world(db):
    make_property(db)
    rt = make_room_type(db, code="STD", rooms=2)
    plan = make_rate_plan(db, [rt], nightly_minor=20000)
    guest = make_guest(db, last_name="Curie")
    return {"rt": rt, "plan": plan, "guest": guest}


def _book(client, auth_headers, world, arrival, departure, *, status="confirmed"):
    return client.post(
        "/api/reservations",
        headers=auth_headers,
        json={
            "primary_guest_id": world["guest"].id,
            "status": status,
            "rooms": [
                {
                    "room_type_id": world["rt"].id,
                    "rate_plan_id": world["plan"].id,
                    "arrival": arrival.isoformat(),
                    "departure": departure.isoformat(),
                }
            ],
        },
    ).json()


def test_occupancy_and_revenue(client, auth_headers, db, world):
    arrival = date.today()
    departure = arrival + timedelta(days=2)
    _book(client, auth_headers, world, arrival, departure)

    occ = service.occupancy_by_day(db, arrival, departure)
    assert [o.rooms_occupied for o in occ] == [1, 1]
    assert occ[0].rooms_total == 2
    assert occ[0].occupancy_pct == 50.0

    rev = service.revenue_summary(db, arrival, departure)
    assert rev.room_revenue_minor == 40000
    assert rev.room_nights_sold == 2
    assert rev.adr_minor == 20000
    assert rev.revpar_minor == 10000  # 40000 / (2 rooms * 2 nights)


def test_cancelled_reservation_excluded(client, auth_headers, db, world):
    arrival = date.today()
    departure = arrival + timedelta(days=1)
    res = _book(client, auth_headers, world, arrival, departure, status="inquiry")
    client.post(f"/api/reservations/{res['id']}/cancel", headers=auth_headers, json={})

    occ = service.occupancy_by_day(db, arrival, departure)
    assert occ[0].rooms_occupied == 0
    rev = service.revenue_summary(db, arrival, departure)
    assert rev.room_revenue_minor == 0


def test_arrivals_departures(client, auth_headers, db, world):
    arrival = date.today()
    departure = arrival + timedelta(days=1)
    _book(client, auth_headers, world, arrival, departure)

    rows = service.arrivals_departures(db, arrival, arrival + timedelta(days=2))
    by_date = {r.date: r for r in rows}
    assert by_date[arrival].arrivals == 1
    assert by_date[departure].departures == 1


def test_reports_endpoints_require_permission(client, db, world):
    from tests.factories import make_user

    make_user(db, username="noreports", permissions=())
    login = client.post(
        "/api/auth/login", data={"username": "noreports", "password": "password123"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    start = date.today()
    end = start + timedelta(days=1)
    resp = client.get(
        "/api/reports/occupancy",
        headers=headers,
        params={"start": start.isoformat(), "end": end.isoformat()},
    )
    assert resp.status_code == 403


def test_invalid_range_rejected(db):
    from app.core.errors import ValidationProblem

    with pytest.raises(ValidationProblem):
        service.occupancy_by_day(db, date.today(), date.today())
