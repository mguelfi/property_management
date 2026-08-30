from __future__ import annotations

from datetime import date, timedelta

import pytest
from sqlalchemy.orm import Session

from app.core.errors import NotFound, ValidationProblem
from app.modules.inventory import service
from app.modules.inventory.models import Room
from tests.factories import make_property, make_room_type


@pytest.fixture
def rooms(db: Session):
    make_property(db)
    rt = make_room_type(db, code="STD", rooms=0)
    make_room_type(db, code="DLX", rooms=0)
    a = Room(number="101", floor="1", room_type_id=rt.id)
    b = Room(number="102", floor="1", room_type_id=rt.id)
    c = Room(number="201", floor="2", room_type_id=rt.id)
    db.add_all([a, b, c])
    db.flush()
    return {"a": a, "b": b, "c": c, "rt": rt}


# --- adjoining room ---------------------------------------------------------- #


def test_set_adjoining_is_symmetric(db, rooms):
    service.set_adjoining_room(db, rooms["a"].id, rooms["b"].id)
    assert rooms["a"].adjoining_room_id == rooms["b"].id
    assert rooms["b"].adjoining_room_id == rooms["a"].id


def test_reassign_detaches_old_partner(db, rooms):
    service.set_adjoining_room(db, rooms["a"].id, rooms["b"].id)
    service.set_adjoining_room(db, rooms["a"].id, rooms["c"].id)
    assert rooms["a"].adjoining_room_id == rooms["c"].id
    assert rooms["c"].adjoining_room_id == rooms["a"].id
    assert rooms["b"].adjoining_room_id is None


def test_target_had_different_partner_is_detached(db, rooms):
    service.set_adjoining_room(db, rooms["b"].id, rooms["c"].id)
    service.set_adjoining_room(db, rooms["a"].id, rooms["c"].id)
    assert rooms["a"].adjoining_room_id == rooms["c"].id
    assert rooms["c"].adjoining_room_id == rooms["a"].id
    assert rooms["b"].adjoining_room_id is None


def test_self_adjoin_rejected(db, rooms):
    with pytest.raises(ValidationProblem):
        service.set_adjoining_room(db, rooms["a"].id, rooms["a"].id)


def test_clear_adjoining_clears_both(db, rooms):
    service.set_adjoining_room(db, rooms["a"].id, rooms["b"].id)
    service.set_adjoining_room(db, rooms["a"].id, None)
    assert rooms["a"].adjoining_room_id is None
    assert rooms["b"].adjoining_room_id is None


def test_deactivate_room_clears_adjoining(db, rooms):
    service.set_adjoining_room(db, rooms["a"].id, rooms["b"].id)
    service.deactivate_room(db, rooms["a"].id)
    assert rooms["a"].is_active is False
    assert rooms["a"].adjoining_room_id is None
    assert rooms["b"].adjoining_room_id is None


def test_adjoining_missing_target(db, rooms):
    with pytest.raises(NotFound):
        service.set_adjoining_room(db, rooms["a"].id, 999999)


def test_update_room_sets_adjoining_via_patch(client, db, rooms, auth_headers):
    resp = client.patch(
        f"/api/inventory/rooms/{rooms['a'].id}",
        headers=auth_headers,
        json={"adjoining_room_id": rooms["b"].id},
    )
    assert resp.status_code == 200
    assert resp.json()["adjoining_room_number"] == "102"
    other = client.get(f"/api/inventory/rooms/{rooms['b'].id}", headers=auth_headers)
    assert other.json()["adjoining_room_id"] == rooms["a"].id


# --- paginated list + floors ---------------------------------------------- #


def test_rooms_paginated_filters(client, db, rooms, auth_headers):
    service.deactivate_room(db, rooms["c"].id)

    r = client.get("/api/inventory/rooms/paginated", headers=auth_headers, params={"floor": "1"})
    assert {x["number"] for x in r.json()["items"]} == {"101", "102"}

    r = client.get("/api/inventory/rooms/paginated", headers=auth_headers, params={"q": "201"})
    assert [x["number"] for x in r.json()["items"]] == ["201"]

    r = client.get(
        "/api/inventory/rooms/paginated", headers=auth_headers, params={"is_active": "false"}
    )
    assert [x["number"] for x in r.json()["items"]] == ["201"]

    r = client.get("/api/inventory/rooms/paginated", headers=auth_headers)
    assert r.json()["total"] == 3  # tri-state None = all


def test_rooms_floors_endpoint(client, rooms, auth_headers):
    r = client.get("/api/inventory/rooms/floors", headers=auth_headers)
    assert r.json() == ["1", "2"]


# --- soft delete --------------------------------------------------------- #


def test_room_type_delete_soft(client, db, rooms, auth_headers):
    resp = client.delete(f"/api/inventory/room-types/{rooms['rt'].id}", headers=auth_headers)
    assert resp.status_code == 204
    db.expire_all()
    assert service.get_room_type(db, rooms["rt"].id).is_active is False


def test_room_delete_soft(client, db, rooms, auth_headers):
    resp = client.delete(f"/api/inventory/rooms/{rooms['a'].id}", headers=auth_headers)
    assert resp.status_code == 204
    db.expire_all()
    assert service.get_room(db, rooms["a"].id).is_active is False


# --- blocks ------------------------------------------------------------- #


def test_create_block_sets_created_by(client, db, rooms, auth_headers, superuser):
    resp = client.post(
        "/api/inventory/blocks",
        headers=auth_headers,
        json={
            "room_id": rooms["a"].id,
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=2)),
            "reason": "maintenance",
        },
    )
    assert resp.status_code == 201
    from app.modules.inventory.models import RoomBlock

    block = db.get(RoomBlock, resp.json()["id"])
    assert block.created_by == superuser.id


def test_patch_block(client, db, rooms, auth_headers):
    created = client.post(
        "/api/inventory/blocks",
        headers=auth_headers,
        json={
            "room_id": rooms["a"].id,
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=2)),
        },
    ).json()
    resp = client.patch(
        f"/api/inventory/blocks/{created['id']}",
        headers=auth_headers,
        json={"note": "fixed", "end_date": str(date.today() + timedelta(days=5))},
    )
    assert resp.status_code == 200
    assert resp.json()["note"] == "fixed"

    bad = client.patch(
        f"/api/inventory/blocks/{created['id']}",
        headers=auth_headers,
        json={"end_date": str(date.today() - timedelta(days=1))},
    )
    assert bad.status_code == 422
