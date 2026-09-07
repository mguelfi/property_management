from __future__ import annotations

from datetime import date, timedelta

import pytest

from tests.factories import make_guest, make_property, make_rate_plan, make_room_type, make_user


@pytest.fixture
def world(db):
    make_property(db)
    rt = make_room_type(db, code="STD", rooms=3)
    plan = make_rate_plan(db, [rt])
    guest = make_guest(db, last_name="Undo")
    return {"rt": rt, "plan": plan, "guest": guest}


def _book(client, auth_headers, world, *, nights=2):
    arrival = date.today()
    departure = arrival + timedelta(days=nights)
    return client.post(
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


def _rooms(client, auth_headers, world):
    rooms = client.get(
        "/api/inventory/rooms", params={"room_type_id": world["rt"].id}, headers=auth_headers
    ).json()
    return sorted(rooms, key=lambda r: r["number"])


def _assign(client, auth_headers, reservation_id, line_id, room_id):
    resp = client.post(
        f"/api/frontdesk/reservations/{reservation_id}/rooms/{line_id}/assign",
        headers=auth_headers,
        json={"room_id": room_id},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _undo(client, headers, audit_event_id):
    return client.post(f"/api/audit/events/{audit_event_id}/undo", headers=headers)


def test_undo_room_assignment_restores_previous_room(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room_a, room_b = _rooms(client, auth_headers, world)[:2]

    _assign(client, auth_headers, res["id"], line_id, room_a["id"])
    reassign = _assign(client, auth_headers, res["id"], line_id, room_b["id"])
    audit_event_id = reassign["audit_event_id"]
    assert audit_event_id is not None

    undo = _undo(client, auth_headers, audit_event_id)
    assert undo.status_code == 200, undo.text

    after = client.get(f"/api/reservations/{res['id']}", headers=auth_headers).json()
    assert after["rooms"][0]["assigned_room_id"] == room_a["id"]

    events = client.get(
        "/api/audit/events",
        params={"event_type": "RoomAssigned"},
        headers=auth_headers,
    ).json()
    assert events["total"] == 3  # initial assign, reassign, undo's re-assign


def test_undo_first_assignment_releases_room(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room = _rooms(client, auth_headers, world)[0]

    assign = _assign(client, auth_headers, res["id"], line_id, room["id"])

    undo = _undo(client, auth_headers, assign["audit_event_id"])
    assert undo.status_code == 200, undo.text

    after = client.get(f"/api/reservations/{res['id']}", headers=auth_headers).json()
    assert after["rooms"][0]["assigned_room_id"] is None


def test_undo_first_assignment_blocked_while_in_house(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room = _rooms(client, auth_headers, world)[0]

    assign = _assign(client, auth_headers, res["id"], line_id, room["id"])
    checkin = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkin", headers=auth_headers
    )
    assert checkin.status_code == 200, checkin.text

    undo = _undo(client, auth_headers, assign["audit_event_id"])
    assert undo.status_code == 409


def test_undo_room_upgrade_voids_charge(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room = _rooms(client, auth_headers, world)[0]
    _assign(client, auth_headers, res["id"], line_id, room["id"])

    checkin = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkin",
        headers=auth_headers,
        json={"upgrades": [{"line_id": line_id, "amount_minor": 5000}]},
    )
    assert checkin.status_code == 200, checkin.text

    events = client.get(
        "/api/audit/events",
        params={"event_type": "RoomUpgraded"},
        headers=auth_headers,
    ).json()
    upgrade_event_id = events["items"][0]["id"]

    folio_before = client.get(
        f"/api/billing/reservations/{res['id']}/folio", headers=auth_headers
    ).json()
    assert any(
        ln["category"] == "upgrade" and not ln["is_void"] for ln in folio_before["lines"]
    )

    undo = _undo(client, auth_headers, upgrade_event_id)
    assert undo.status_code == 200, undo.text

    folio_after = client.get(
        f"/api/billing/reservations/{res['id']}/folio", headers=auth_headers
    ).json()
    upgrade_lines = [ln for ln in folio_after["lines"] if ln["category"] == "upgrade"]
    assert upgrade_lines and all(ln["is_void"] for ln in upgrade_lines)


def test_undo_free_upgrade_rejected(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room = _rooms(client, auth_headers, world)[0]
    _assign(client, auth_headers, res["id"], line_id, room["id"])

    checkin = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkin",
        headers=auth_headers,
        json={"upgrades": [{"line_id": line_id, "amount_minor": 0}]},
    )
    assert checkin.status_code == 200, checkin.text

    events = client.get(
        "/api/audit/events",
        params={"event_type": "RoomUpgraded"},
        headers=auth_headers,
    ).json()
    upgrade_event_id = events["items"][0]["id"]

    undo = _undo(client, auth_headers, upgrade_event_id)
    assert undo.status_code == 409


def test_undo_checkin_reverts_status(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room = _rooms(client, auth_headers, world)[0]
    _assign(client, auth_headers, res["id"], line_id, room["id"])

    checkin = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkin", headers=auth_headers
    )
    assert checkin.status_code == 200, checkin.text

    undo = _undo(client, auth_headers, checkin.json()["audit_event_id"])
    assert undo.status_code == 200, undo.text

    after = client.get(f"/api/reservations/{res['id']}", headers=auth_headers).json()
    assert after["status"] == "confirmed"
    assert after["checked_in_at"] is None


def test_undo_checkout_reverts_status_and_reopens_folio(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room = _rooms(client, auth_headers, world)[0]
    _assign(client, auth_headers, res["id"], line_id, room["id"])
    client.post(f"/api/frontdesk/reservations/{res['id']}/checkin", headers=auth_headers)

    checkout = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkout",
        headers=auth_headers,
        json={"allow_balance": True},
    )
    assert checkout.status_code == 200, checkout.text

    folio_closed = client.get(
        f"/api/billing/reservations/{res['id']}/folio", headers=auth_headers
    ).json()
    assert folio_closed["status"] == "closed"

    undo = _undo(client, auth_headers, checkout.json()["audit_event_id"])
    assert undo.status_code == 200, undo.text

    after = client.get(f"/api/reservations/{res['id']}", headers=auth_headers).json()
    assert after["status"] == "in_house"
    folio_reopened = client.get(
        f"/api/billing/reservations/{res['id']}/folio", headers=auth_headers
    ).json()
    assert folio_reopened["status"] == "open"


def test_undo_checkout_restores_housekeeping_state_only_where_unchanged(
    client, auth_headers, world
):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room = _rooms(client, auth_headers, world)[0]
    _assign(client, auth_headers, res["id"], line_id, room["id"])
    client.post(f"/api/frontdesk/reservations/{res['id']}/checkin", headers=auth_headers)

    # Room is already dirty for an unrelated reason before checkout.
    client.post(
        f"/api/housekeeping/rooms/{room['id']}/status",
        headers=auth_headers,
        json={"status": "dirty", "note": "unrelated spill"},
    )

    checkout = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkout",
        headers=auth_headers,
        json={"allow_balance": True},
    )
    assert checkout.status_code == 200, checkout.text

    undo = _undo(client, auth_headers, checkout.json()["audit_event_id"])
    assert undo.status_code == 200, undo.text

    board = client.get("/api/housekeeping/board", headers=auth_headers).json()
    row = next(r for r in board if r["room_id"] == room["id"])
    assert row["status"] == "dirty"  # stays dirty, not clobbered back to clean


def test_undo_checkout_restores_clean_room(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room = _rooms(client, auth_headers, world)[0]
    _assign(client, auth_headers, res["id"], line_id, room["id"])
    client.post(f"/api/frontdesk/reservations/{res['id']}/checkin", headers=auth_headers)

    checkout = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkout",
        headers=auth_headers,
        json={"allow_balance": True},
    )
    assert checkout.status_code == 200, checkout.text

    undo = _undo(client, auth_headers, checkout.json()["audit_event_id"])
    assert undo.status_code == 200, undo.text

    board = client.get("/api/housekeeping/board", headers=auth_headers).json()
    row = next(r for r in board if r["room_id"] == room["id"])
    assert row["status"] == "clean"


def test_undo_checkout_skips_room_touched_after_checkout(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room = _rooms(client, auth_headers, world)[0]
    _assign(client, auth_headers, res["id"], line_id, room["id"])
    client.post(f"/api/frontdesk/reservations/{res['id']}/checkin", headers=auth_headers)

    checkout = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkout",
        headers=auth_headers,
        json={"allow_balance": True},
    )
    assert checkout.status_code == 200, checkout.text

    # Housekeeping already inspected the room before the undo happens.
    client.post(
        f"/api/housekeeping/rooms/{room['id']}/status",
        headers=auth_headers,
        json={"status": "inspected"},
    )

    undo = _undo(client, auth_headers, checkout.json()["audit_event_id"])
    assert undo.status_code == 200, undo.text

    board = client.get("/api/housekeeping/board", headers=auth_headers).json()
    row = next(r for r in board if r["room_id"] == room["id"])
    assert row["status"] == "inspected"  # untouched by the undo


def test_undo_blocked_by_concurrent_third_party_change(client, db, auth_headers, world):
    make_user(db, username="agent2", permissions=("frontdesk.operate",))
    login = client.post(
        "/api/auth/login", data={"username": "agent2", "password": "password123"}
    )
    headers2 = {"Authorization": f"Bearer {login.json()['access_token']}"}

    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room_a, room_b, room_c = _rooms(client, auth_headers, world)

    assign = _assign(client, auth_headers, res["id"], line_id, room_a["id"])
    _assign(client, headers2, res["id"], line_id, room_c["id"])

    undo = _undo(client, auth_headers, assign["audit_event_id"])
    assert undo.status_code == 409


def test_chained_multi_undo_assignments(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room_a, room_b = _rooms(client, auth_headers, world)[:2]

    assign_a = _assign(client, auth_headers, res["id"], line_id, room_a["id"])
    assign_b = _assign(client, auth_headers, res["id"], line_id, room_b["id"])

    undo_b = _undo(client, auth_headers, assign_b["audit_event_id"])
    assert undo_b.status_code == 200, undo_b.text
    undo_a = _undo(client, auth_headers, assign_a["audit_event_id"])
    assert undo_a.status_code == 200, undo_a.text

    after = client.get(f"/api/reservations/{res['id']}", headers=auth_headers).json()
    assert after["rooms"][0]["assigned_room_id"] is None


def test_chained_multi_undo_checkin_checkout(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room = _rooms(client, auth_headers, world)[0]
    _assign(client, auth_headers, res["id"], line_id, room["id"])
    checkin = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkin", headers=auth_headers
    )
    checkout = client.post(
        f"/api/frontdesk/reservations/{res['id']}/checkout",
        headers=auth_headers,
        json={"allow_balance": True},
    )
    assert checkout.status_code == 200, checkout.text

    undo_checkout = _undo(client, auth_headers, checkout.json()["audit_event_id"])
    assert undo_checkout.status_code == 200, undo_checkout.text
    undo_checkin = _undo(client, auth_headers, checkin.json()["audit_event_id"])
    assert undo_checkin.status_code == 200, undo_checkin.text

    after = client.get(f"/api/reservations/{res['id']}", headers=auth_headers).json()
    assert after["status"] == "confirmed"


def test_undo_rejected_for_different_actor(client, db, auth_headers, world):
    make_user(db, username="agent2", permissions=("frontdesk.operate",))
    login = client.post(
        "/api/auth/login", data={"username": "agent2", "password": "password123"}
    )
    headers2 = {"Authorization": f"Bearer {login.json()['access_token']}"}

    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room = _rooms(client, auth_headers, world)[0]
    assign = _assign(client, auth_headers, res["id"], line_id, room["id"])

    undo = _undo(client, headers2, assign["audit_event_id"])
    assert undo.status_code == 403


def test_undo_already_undone_rejected(client, auth_headers, world):
    res = _book(client, auth_headers, world)
    line_id = res["rooms"][0]["id"]
    room = _rooms(client, auth_headers, world)[0]
    assign = _assign(client, auth_headers, res["id"], line_id, room["id"])

    first = _undo(client, auth_headers, assign["audit_event_id"])
    assert first.status_code == 200, first.text
    second = _undo(client, auth_headers, assign["audit_event_id"])
    assert second.status_code == 409


def test_undo_unknown_event_type_rejected(client, auth_headers, world):
    resp = client.post(
        "/api/frontdesk/night-audit",
        headers=auth_headers,
        json={"as_of": date.today().isoformat()},
    )
    assert resp.status_code == 200, resp.text

    events = client.get(
        "/api/audit/events", params={"event_type": "NightAuditRun"}, headers=auth_headers
    ).json()
    night_audit_event_id = events["items"][0]["id"]

    undo = _undo(client, auth_headers, night_audit_event_id)
    assert undo.status_code == 409


def test_undo_missing_event_id(client, auth_headers):
    undo = _undo(client, auth_headers, 9_999_999)
    assert undo.status_code == 404
