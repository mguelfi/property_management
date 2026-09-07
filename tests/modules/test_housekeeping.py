from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.modules.frontdesk.events import GuestCheckedOut
from app.modules.housekeeping import service
from app.modules.housekeeping.models import HousekeepingTaskStatus, RoomHousekeepingStatus
from tests.factories import make_property, make_room_type


@pytest.fixture
def rooms(db: Session):
    make_property(db)
    rt = make_room_type(db, code="STD", rooms=0)
    from app.modules.inventory.models import Room

    a = Room(number="101", floor="1", room_type_id=rt.id)
    b = Room(number="102", floor="1", room_type_id=rt.id)
    db.add_all([a, b])
    db.flush()
    return {"a": a, "b": b, "rt": rt}


def test_default_status_is_clean(db, rooms):
    board = service.list_board(db)
    assert {row.room_id: row.status for row in board} == {
        rooms["a"].id: RoomHousekeepingStatus.clean,
        rooms["b"].id: RoomHousekeepingStatus.clean,
    }


def test_set_status_persists_note_and_actor(db, rooms):
    state = service.set_status(
        db, room_id=rooms["a"].id, status=RoomHousekeepingStatus.dirty,
        actor_id=42, note="spill in bathroom",
    )
    assert state.status == RoomHousekeepingStatus.dirty
    assert state.updated_by == 42
    assert state.note == "spill in bathroom"


def test_guest_checked_out_marks_rooms_dirty(db, rooms):
    event = GuestCheckedOut(
        reservation_id=1,
        reference="R000001",
        room_ids=(rooms["a"].id,),
        folio_id=1,
        folio_closed_by_this_action=False,
        actor_id=7,
    )
    service.on_guest_checked_out(event, db)
    board = {row.room_id: row.status for row in service.list_board(db)}
    assert board[rooms["a"].id] == RoomHousekeepingStatus.dirty
    assert board[rooms["b"].id] == RoomHousekeepingStatus.clean


def test_board_filters_by_floor_and_status(db, rooms):
    service.set_status(
        db, room_id=rooms["a"].id, status=RoomHousekeepingStatus.dirty, actor_id=None
    )
    only_floor_1 = service.list_board(db, floor="1")
    assert {row.room_id for row in only_floor_1} == {rooms["a"].id, rooms["b"].id}

    only_dirty = service.list_board(db, status=RoomHousekeepingStatus.dirty)
    assert [row.room_id for row in only_dirty] == [rooms["a"].id]


def test_board_endpoint_requires_permission(client, db, rooms):
    from tests.factories import make_user

    make_user(db, username="noperm", permissions=())
    login = client.post(
        "/api/auth/login", data={"username": "noperm", "password": "password123"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    resp = client.get("/api/housekeeping/board", headers=headers)
    assert resp.status_code == 403


def test_set_status_endpoint_requires_manage(client, db, rooms):
    from tests.factories import make_user

    make_user(db, username="viewer", permissions=("housekeeping.view",))
    login = client.post(
        "/api/auth/login", data={"username": "viewer", "password": "password123"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    resp = client.post(
        f"/api/housekeeping/rooms/{rooms['a'].id}/status",
        headers=headers,
        json={"status": "dirty"},
    )
    assert resp.status_code == 403


def test_task_create_and_update(db, rooms):
    task = service.create_task(
        db, {"room_id": rooms["a"].id, "description": "deep clean"}, actor_id=1
    )
    assert task.status == HousekeepingTaskStatus.open
    updated = service.update_task(db, task.id, {"status": HousekeepingTaskStatus.done})
    assert updated.status == HousekeepingTaskStatus.done
    assert updated.completed_at is not None


def test_create_task_missing_room(db):
    from app.core.errors import NotFound

    with pytest.raises(NotFound):
        service.create_task(db, {"room_id": 999999, "description": "x"}, actor_id=None)
