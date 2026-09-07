from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.modules.rates import service as rates_service
from tests.factories import (
    make_guest,
    make_property,
    make_rate_plan,
    make_room_type,
    make_room_view,
)


@pytest.fixture
def world(db):
    make_property(db)
    std = make_room_type(db, code="STD", rooms=2)
    dlx = make_room_type(db, code="DLX", rooms=2)
    plan = make_rate_plan(db, [std, dlx], nightly_minor=15000)
    # give the deluxe room type a distinct, higher nightly rate for the delta test
    today = date.today()
    rates_service.set_rates(
        db,
        rate_plan_id=plan.id,
        room_type_id=dlx.id,
        start_date=today - timedelta(days=1),
        end_date=today + timedelta(days=120),
        amount_minor=25000,
    )
    garden = make_room_view(db, code="GARDEN", sort_order=100, surcharge_minor=0)
    ocean = make_room_view(db, code="OCEAN", sort_order=200, surcharge_minor=3000)
    guest = make_guest(db, last_name="Upgrade")
    return {"std": std, "dlx": dlx, "plan": plan, "garden": garden, "ocean": ocean, "guest": guest}


def _book(client, auth_headers, world, *, room_type=None, nights=2, guest_id=None):
    rt = room_type or world["std"]
    arrival = date.today()
    departure = arrival + timedelta(days=nights)
    res = client.post(
        "/api/reservations",
        headers=auth_headers,
        json={
            "primary_guest_id": guest_id or world["guest"].id,
            "rooms": [
                {
                    "room_type_id": rt.id,
                    "rate_plan_id": world["plan"].id,
                    "arrival": arrival.isoformat(),
                    "departure": departure.isoformat(),
                }
            ],
        },
    ).json()
    return res


def _room_id(client, auth_headers, room_type_id, *, view_id=None, number=None):
    rooms = client.get(
        "/api/inventory/rooms", params={"room_type_id": room_type_id}, headers=auth_headers
    ).json()
    room = next(r for r in rooms if number is None or r["number"].endswith(number))
    if view_id is not None:
        client.patch(
            f"/api/inventory/rooms/{room['id']}", headers=auth_headers, json={"view_id": view_id}
        )
    return room["id"]


def test_same_type_better_view_needs_no_mismatch_flag(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room_id = _room_id(client, auth_headers, world["std"].id, view_id=world["ocean"].id)

    resp = client.post(
        f"/api/frontdesk/reservations/{res['id']}/rooms/{line_id}/assign",
        headers=auth_headers,
        json={"room_id": room_id},
    )
    assert resp.status_code == 200, resp.text


def test_upgrade_quote_same_type_view_only(client, auth_headers, world):
    # Quoted BEFORE assigning: this is the real usage — staff previews the
    # price while picking a candidate room, then assigns if they proceed.
    res = _book(client, auth_headers, world, nights=2)
    line_id = res["rooms"][0]["id"]
    room_id = _room_id(client, auth_headers, world["std"].id, view_id=world["ocean"].id)

    quote = client.get(
        f"/api/frontdesk/reservations/{res['id']}/rooms/{line_id}/upgrade-quote",
        params={"room_id": room_id},
        headers=auth_headers,
    ).json()
    assert quote["room_type_delta_minor"] == 0
    assert quote["view_surcharge_minor"] == 3000 * 2
    assert quote["total_minor"] == 3000 * 2
    assert quote["to_view_id"] == world["ocean"].id


def test_free_upgrade_posts_no_charge_but_is_audited(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room_id = _room_id(client, auth_headers, world["std"].id, view_id=world["ocean"].id)
    client.post(
        f"/api/frontdesk/reservations/{res['id']}/rooms/{line_id}/assign",
        headers=auth_headers,
        json={"room_id": room_id},
    )

    checkin = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkin",
        headers=auth_headers,
        json={
            "upgrades": [
                {"line_id": line_id, "amount_minor": 0, "to_view_id": world["ocean"].id}
            ]
        },
    )
    assert checkin.status_code == 200, checkin.text

    folio = client.get(
        f"/api/billing/reservations/{res['id']}/folio", headers=auth_headers
    ).json()
    assert not any(ln["category"] == "upgrade" for ln in folio["lines"])

    events = client.get(
        "/api/audit/events", params={"event_type": "RoomUpgraded"}, headers=auth_headers
    ).json()
    assert events["total"] == 1


def test_paid_room_type_upgrade_charges_staff_edited_amount_and_taxes_it(
    client, auth_headers, world
):
    res = _book(client, auth_headers, world, nights=2)
    line_id = res["rooms"][0]["id"]
    dlx_room_id = _room_id(client, auth_headers, world["dlx"].id)

    assign = client.post(
        f"/api/frontdesk/reservations/{res['id']}/rooms/{line_id}/assign",
        headers=auth_headers,
        json={"room_id": dlx_room_id, "allow_type_mismatch": True},
    )
    assert assign.status_code == 200, assign.text

    quote = client.get(
        f"/api/frontdesk/reservations/{res['id']}/rooms/{line_id}/upgrade-quote",
        params={"room_id": dlx_room_id},
        headers=auth_headers,
    ).json()
    assert quote["room_type_delta_minor"] == (25000 - 15000) * 2  # 2 nights

    client.post(
        "/api/billing/tax-rules",
        headers=auth_headers,
        json={"name": "Upgrade GST", "percent": 10, "applies_to_categories": ["upgrade"]},
    )

    staff_amount = quote["total_minor"] + 500  # staff can override the suggestion
    checkin = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkin",
        headers=auth_headers,
        json={"upgrades": [{"line_id": line_id, "amount_minor": staff_amount}]},
    )
    assert checkin.status_code == 200, checkin.text

    folio = client.get(
        f"/api/billing/reservations/{res['id']}/folio", headers=auth_headers
    ).json()
    upgrade_lines = [ln for ln in folio["lines"] if ln["category"] == "upgrade"]
    assert len(upgrade_lines) == 1
    assert upgrade_lines[0]["amount_minor"] == staff_amount
    tax_lines = [ln for ln in folio["lines"] if ln["kind"] == "tax"]
    assert any(ln["amount_minor"] == round(staff_amount * 0.10) for ln in tax_lines)


def test_multi_room_reservation_only_upgraded_line_gets_charged(client, auth_headers, world):
    arrival = date.today()
    departure = arrival + timedelta(days=1)
    res = client.post(
        "/api/reservations",
        headers=auth_headers,
        json={
            "primary_guest_id": world["guest"].id,
            "rooms": [
                {
                    "room_type_id": world["std"].id,
                    "rate_plan_id": world["plan"].id,
                    "arrival": arrival.isoformat(),
                    "departure": departure.isoformat(),
                },
                {
                    "room_type_id": world["std"].id,
                    "rate_plan_id": world["plan"].id,
                    "arrival": arrival.isoformat(),
                    "departure": departure.isoformat(),
                },
            ],
        },
    ).json()
    line_a, line_b = res["rooms"][0]["id"], res["rooms"][1]["id"]
    room_a = _room_id(client, auth_headers, world["std"].id, view_id=world["ocean"].id, number="1")
    room_b = _room_id(client, auth_headers, world["std"].id, number="2")
    client.post(
        f"/api/frontdesk/reservations/{res['id']}/rooms/{line_a}/assign",
        headers=auth_headers,
        json={"room_id": room_a},
    )
    client.post(
        f"/api/frontdesk/reservations/{res['id']}/rooms/{line_b}/assign",
        headers=auth_headers,
        json={"room_id": room_b},
    )

    checkin = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkin",
        headers=auth_headers,
        json={"upgrades": [{"line_id": line_a, "amount_minor": 3000}]},
    )
    assert checkin.status_code == 200, checkin.text
    assert checkin.json()["status"] == "in_house"

    folio = client.get(
        f"/api/billing/reservations/{res['id']}/folio", headers=auth_headers
    ).json()
    upgrade_lines = [ln for ln in folio["lines"] if ln["category"] == "upgrade"]
    assert len(upgrade_lines) == 1
    assert upgrade_lines[0]["amount_minor"] == 3000


def test_admin_edits_view_surcharge_reflected_immediately(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room_id = _room_id(client, auth_headers, world["std"].id, view_id=world["ocean"].id)

    client.patch(
        f"/api/inventory/room-views/{world['ocean'].id}",
        headers=auth_headers,
        json={"surcharge_minor": 5000},
    )

    quote = client.get(
        f"/api/frontdesk/reservations/{res['id']}/rooms/{line_id}/upgrade-quote",
        params={"room_id": room_id},
        headers=auth_headers,
    ).json()
    assert quote["view_surcharge_minor"] == 5000 * quote["nights"]


def test_checkin_without_upgrades_body_still_works(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room_id = _room_id(client, auth_headers, world["std"].id)
    client.post(
        f"/api/frontdesk/reservations/{res['id']}/rooms/{line_id}/assign",
        headers=auth_headers,
        json={"room_id": room_id},
    )
    resp = client.post(f"/api/frontdesk/reservations/{res['id']}/checkin", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "in_house"


def test_upgrade_never_changes_booked_room_type_or_rate(client, auth_headers, db, world):
    res = _book(client, auth_headers, world, nights=2)
    line_id = res["rooms"][0]["id"]
    before_rate = res["rooms"][0]["rate_total_minor"]
    dlx_room_id = _room_id(client, auth_headers, world["dlx"].id)

    client.post(
        f"/api/frontdesk/reservations/{res['id']}/rooms/{line_id}/assign",
        headers=auth_headers,
        json={"room_id": dlx_room_id, "allow_type_mismatch": True},
    )
    client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkin",
        headers=auth_headers,
        json={"upgrades": [{"line_id": line_id, "amount_minor": 20000}]},
    )

    after = client.get(f"/api/reservations/{res['id']}", headers=auth_headers).json()
    line = after["rooms"][0]
    assert line["room_type_id"] == world["std"].id
    assert line["rate_total_minor"] == before_rate
    assert line["assigned_room_id"] == dlx_room_id
