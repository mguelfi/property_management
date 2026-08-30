"""Availability search -> booking -> check-in -> charges -> payment -> check-out."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.jobs.post_room_charges import post_for_night
from tests.factories import make_guest, make_property, make_rate_plan, make_room_type


@pytest.fixture
def world(db):
    make_property(db)
    rt = make_room_type(db, code="STD", rooms=2)
    plan = make_rate_plan(db, [rt], nightly_minor=20000)
    guest = make_guest(db, last_name="Curie")
    return {"rt": rt, "plan": plan, "guest": guest}


def test_full_stay(client, auth_headers, db, world):
    rt, plan, guest = world["rt"], world["plan"], world["guest"]
    arrival = date.today()
    departure = arrival + timedelta(days=2)
    q = {"arrival": arrival.isoformat(), "departure": departure.isoformat()}

    # 1. availability
    avail = client.get("/api/availability", params={**q, "adults": 2}, headers=auth_headers)
    assert avail.status_code == 200
    offer = next(o for o in avail.json() if o["room_type_id"] == rt.id)
    assert offer["units_available"] == 2

    # 2. quote
    quote = client.get(
        "/api/availability/quote",
        params={**q, "room_type_id": rt.id, "rate_plan_id": plan.id},
        headers=auth_headers,
    )
    assert quote.json()["total_minor"] == 40000

    # 3. book
    res = client.post(
        "/api/reservations",
        headers=auth_headers,
        json={
            "primary_guest_id": guest.id,
            "status": "confirmed",
            "rooms": [
                {
                    "room_type_id": rt.id,
                    "rate_plan_id": plan.id,
                    "arrival": arrival.isoformat(),
                    "departure": departure.isoformat(),
                    "adults": 2,
                }
            ],
        },
    )
    assert res.status_code == 201, res.text
    reservation = res.json()
    assert reservation["total_minor"] == 40000
    line_id = reservation["rooms"][0]["id"]

    # 4. inventory decremented
    avail2 = client.get("/api/availability", params={**q, "adults": 2}, headers=auth_headers)
    offer2 = next(o for o in avail2.json() if o["room_type_id"] == rt.id)
    assert offer2["units_available"] == 1

    # 5. assign + check in
    rooms = client.get(
        "/api/inventory/rooms", params={"room_type_id": rt.id}, headers=auth_headers
    ).json()
    room_id = rooms[0]["id"]
    assign = client.post(
        f"/api/frontdesk/reservations/{reservation['id']}/rooms/{line_id}/assign",
        headers=auth_headers,
        json={"room_id": room_id},
    )
    assert assign.status_code == 200, assign.text
    checkin = client.post(
        f"/api/frontdesk/reservations/{reservation['id']}/checkin", headers=auth_headers
    )
    assert checkin.status_code == 200
    assert checkin.json()["status"] == "in_house"

    # 5b. the guest dislikes the room -> move them while already in-house
    other_room_id = rooms[1]["id"]
    moved = client.post(
        f"/api/frontdesk/reservations/{reservation['id']}/rooms/{line_id}/assign",
        headers=auth_headers,
        json={"room_id": other_room_id},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["rooms"][0]["assigned_room_id"] == other_room_id

    # 6. folio + room-service charge (with 10% GST rule)
    client.post(
        "/api/billing/tax-rules",
        headers=auth_headers,
        json={"name": "GST", "percent": "10", "applies_to_categories": ["room", "room_service"]},
    )
    folio = client.get(
        f"/api/billing/reservations/{reservation['id']}/folio", headers=auth_headers
    ).json()
    folio_id = folio["id"]
    charged = client.post(
        f"/api/billing/folios/{folio_id}/charges",
        headers=auth_headers,
        json={"category": "room_service", "description": "Club sandwich", "amount_minor": 2500},
    )
    assert charged.status_code == 200
    assert charged.json()["balance_minor"] == 2500 + 250  # charge + GST

    # 7. nightly room charges for both nights
    posted = post_for_night(db, arrival) + post_for_night(db, arrival + timedelta(days=1))
    assert posted == 2
    folio = client.get(f"/api/billing/folios/{folio_id}", headers=auth_headers).json()
    # 2 nights * 20000 + 10% GST = 44000, plus 2750 room service => 46750
    assert folio["balance_minor"] == 46750

    # 8. pay it off
    pay = client.post(
        f"/api/billing/folios/{folio_id}/payments",
        headers=auth_headers,
        json={"method": "card_terminal", "amount_minor": 46750},
    )
    assert pay.json()["balance_minor"] == 0

    # 9. checkout succeeds only at zero balance
    checkout = client.post(
        f"/api/frontdesk/reservations/{reservation['id']}/checkout",
        headers=auth_headers,
        json={},
    )
    assert checkout.status_code == 200
    assert checkout.json()["status"] == "checked_out"

    # 10. audit trail
    events = client.get(
        "/api/audit/events",
        params={"entity_type": "reservation", "entity_id": reservation["id"]},
        headers=auth_headers,
    ).json()
    kinds = {e["event_type"] for e in events["items"]}
    assert {"ReservationConfirmed", "GuestCheckedIn", "GuestCheckedOut"} <= kinds
    confirmed = next(e for e in events["items"] if e["event_type"] == "ReservationConfirmed")
    assert confirmed["actor_username"] == "root"  # dereferenced, not a bare id


def test_checkout_blocked_by_balance(client, auth_headers, db, world):
    rt, plan, guest = world["rt"], world["plan"], world["guest"]
    arrival = date.today()
    res = client.post(
        "/api/reservations",
        headers=auth_headers,
        json={
            "primary_guest_id": guest.id,
            "rooms": [
                {
                    "room_type_id": rt.id,
                    "rate_plan_id": plan.id,
                    "arrival": arrival.isoformat(),
                    "departure": (arrival + timedelta(days=1)).isoformat(),
                }
            ],
        },
    ).json()
    line_id = res["rooms"][0]["id"]
    room_id = client.get(
        "/api/inventory/rooms", params={"room_type_id": rt.id}, headers=auth_headers
    ).json()[0]["id"]
    client.post(
        f"/api/frontdesk/reservations/{res['id']}/rooms/{line_id}/assign",
        headers=auth_headers,
        json={"room_id": room_id},
    )
    client.post(f"/api/frontdesk/reservations/{res['id']}/checkin", headers=auth_headers)
    folio_id = client.get(
        f"/api/billing/reservations/{res['id']}/folio", headers=auth_headers
    ).json()["id"]
    client.post(
        f"/api/billing/folios/{folio_id}/charges",
        headers=auth_headers,
        json={"category": "misc", "description": "Minibar", "amount_minor": 900},
    )
    blocked = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkout", headers=auth_headers, json={}
    )
    assert blocked.status_code == 409

    # superuser may override
    ok = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkout",
        headers=auth_headers,
        json={"allow_balance": True},
    )
    assert ok.status_code == 200
