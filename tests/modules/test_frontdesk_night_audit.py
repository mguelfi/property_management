from __future__ import annotations

from datetime import date, timedelta

import pytest

from tests.factories import make_guest, make_property, make_rate_plan, make_room_type


@pytest.fixture
def world(db):
    make_property(db)
    rt = make_room_type(db, code="STD", rooms=2)
    plan = make_rate_plan(db, [rt], nightly_minor=20000)
    guest = make_guest(db, last_name="Franklin")
    return {"rt": rt, "plan": plan, "guest": guest}


def _book_and_check_in(client, auth_headers, world, arrival, departure):
    res = client.post(
        "/api/reservations",
        headers=auth_headers,
        json={
            "primary_guest_id": world["guest"].id,
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
    line_id = res["rooms"][0]["id"]
    room_id = client.get(
        "/api/inventory/rooms", params={"room_type_id": world["rt"].id}, headers=auth_headers
    ).json()[0]["id"]
    client.post(
        f"/api/frontdesk/reservations/{res['id']}/rooms/{line_id}/assign",
        headers=auth_headers,
        json={"room_id": room_id},
    )
    client.post(f"/api/frontdesk/reservations/{res['id']}/checkin", headers=auth_headers)
    return res


def test_night_audit_posts_charges_and_is_idempotent(client, auth_headers, db, world):
    arrival = date.today()
    departure = arrival + timedelta(days=2)
    res = _book_and_check_in(client, auth_headers, world, arrival, departure)

    first = client.post(
        "/api/frontdesk/night-audit",
        headers=auth_headers,
        json={"as_of": (arrival + timedelta(days=1)).isoformat()},
    )
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["charges_posted"] == 1
    assert body["night"] == arrival.isoformat()

    again = client.post(
        "/api/frontdesk/night-audit",
        headers=auth_headers,
        json={"as_of": (arrival + timedelta(days=1)).isoformat()},
    )
    assert again.json()["charges_posted"] == 0  # already posted -> no-op

    folio = client.get(
        f"/api/billing/reservations/{res['id']}/folio", headers=auth_headers
    ).json()
    assert folio["balance_minor"] == 20000


def test_night_audit_marks_no_shows(client, auth_headers, db, world):
    stale_arrival = date.today() - timedelta(days=1)
    res = client.post(
        "/api/reservations",
        headers=auth_headers,
        json={
            "primary_guest_id": world["guest"].id,
            "rooms": [
                {
                    "room_type_id": world["rt"].id,
                    "rate_plan_id": world["plan"].id,
                    "arrival": stale_arrival.isoformat(),
                    "departure": date.today().isoformat(),
                }
            ],
        },
    ).json()

    resp = client.post(
        "/api/frontdesk/night-audit",
        headers=auth_headers,
        json={"as_of": date.today().isoformat()},
    )
    assert resp.json()["no_shows_marked"] == 1

    updated = client.get(f"/api/reservations/{res['id']}", headers=auth_headers).json()
    assert updated["status"] == "no_show"


def test_night_audit_requires_permission(client, db, world):
    from tests.factories import make_user

    make_user(db, username="frontdesk_only", permissions=("frontdesk.operate",))
    login = client.post(
        "/api/auth/login", data={"username": "frontdesk_only", "password": "password123"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    resp = client.post("/api/frontdesk/night-audit", headers=headers, json={})
    assert resp.status_code == 403


def test_night_audit_appears_in_audit_log(client, auth_headers, db, world):
    resp = client.post(
        "/api/frontdesk/night-audit",
        headers=auth_headers,
        json={"as_of": date.today().isoformat()},
    )
    assert resp.status_code == 200

    events = client.get(
        "/api/audit/events",
        params={"event_type": "NightAuditRun"},
        headers=auth_headers,
    ).json()
    assert events["total"] == 1
