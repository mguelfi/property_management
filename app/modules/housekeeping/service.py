from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.core.events import Event
from app.modules.frontdesk.events import GuestCheckedOut
from app.modules.inventory.models import Room

from .models import (
    HousekeepingTask,
    HousekeepingTaskStatus,
    RoomHousekeepingState,
    RoomHousekeepingStatus,
)
from .schemas import RoomStatusOut


def get_or_create_state(session: Session, room_id: int) -> RoomHousekeepingState:
    state = session.scalar(
        select(RoomHousekeepingState).where(RoomHousekeepingState.room_id == room_id)
    )
    if state is None:
        state = RoomHousekeepingState(room_id=room_id, status=RoomHousekeepingStatus.clean)
        session.add(state)
        session.flush()
    return state


def set_status(
    session: Session,
    *,
    room_id: int,
    status: RoomHousekeepingStatus,
    actor_id: int | None,
    note: str = "",
) -> RoomHousekeepingState:
    if session.get(Room, room_id) is None:
        raise NotFound("Room not found")
    state = get_or_create_state(session, room_id)
    state.status = status
    state.updated_by = actor_id
    state.note = note
    session.flush()
    return state


def list_board(
    session: Session, *, floor: str | None = None, status: RoomHousekeepingStatus | None = None
) -> list[RoomStatusOut]:
    stmt = select(Room).where(Room.is_active.is_(True)).order_by(Room.floor, Room.number)
    if floor is not None:
        stmt = stmt.where(Room.floor == floor)
    rooms = list(session.scalars(stmt))
    states = {
        s.room_id: s
        for s in session.scalars(
            select(RoomHousekeepingState).where(
                RoomHousekeepingState.room_id.in_([r.id for r in rooms])
            )
        )
    }
    rows: list[RoomStatusOut] = []
    for room in rooms:
        state = states.get(room.id)
        effective_status = state.status if state else RoomHousekeepingStatus.clean
        if status is not None and effective_status != status:
            continue
        rows.append(
            RoomStatusOut(
                room_id=room.id,
                room_number=room.number,
                floor=room.floor,
                room_type_id=room.room_type_id,
                status=effective_status,
                updated_at=state.updated_at if state else None,
                updated_by=state.updated_by if state else None,
                note=state.note if state else "",
            )
        )
    return rows


def on_guest_checked_out(event: Event, session: Session) -> None:
    event = cast(GuestCheckedOut, event)
    for room_id in event.room_ids:
        prior = get_or_create_state(session, room_id)
        event.undo_context.setdefault("housekeeping", {})[str(room_id)] = prior.status.value
        set_status(
            session,
            room_id=room_id,
            status=RoomHousekeepingStatus.dirty,
            actor_id=event.actor_id,
            note="auto: guest checked out",
        )


def revert_guest_checked_out_housekeeping(event: GuestCheckedOut, session: Session) -> None:
    """Best-effort, per room, never raises: the housekeeping dirty-flag is a
    secondary side effect of check-out and must never block or corrupt the
    primary reservation/folio undo. A room is only reset if it's still
    exactly ``dirty`` (what check-out set) — anything else (already cleaned,
    inspected, taken out of service since) is left alone."""
    housekeeping: dict[str, str] = event.undo_context.get("housekeeping", {})  # type: ignore[assignment]
    for room_id_str, prior_status in housekeeping.items():
        room_id = int(room_id_str)
        state = get_or_create_state(session, room_id)
        if state.status is RoomHousekeepingStatus.dirty:
            state.status = RoomHousekeepingStatus(prior_status)
            session.flush()


# --------------------------------------------------------------------------- #
# Tasks
# --------------------------------------------------------------------------- #


def get_task(session: Session, task_id: int) -> HousekeepingTask:
    task = session.get(HousekeepingTask, task_id)
    if task is None:
        raise NotFound("Task not found")
    return task


def list_tasks(
    session: Session, *, status: HousekeepingTaskStatus | None = None
) -> list[HousekeepingTask]:
    stmt = select(HousekeepingTask).order_by(HousekeepingTask.created_at.desc())
    if status is not None:
        stmt = stmt.where(HousekeepingTask.status == status)
    return list(session.scalars(stmt))


def create_task(
    session: Session, data: dict[str, Any], *, actor_id: int | None
) -> HousekeepingTask:
    if session.get(Room, data["room_id"]) is None:
        raise NotFound("Room not found")
    task = HousekeepingTask(**data, created_by=actor_id)
    session.add(task)
    session.flush()
    return task


def update_task(session: Session, task_id: int, changes: dict[str, Any]) -> HousekeepingTask:
    task = get_task(session, task_id)
    for key, value in changes.items():
        setattr(task, key, value)
    if changes.get("status") == HousekeepingTaskStatus.done and task.completed_at is None:
        task.completed_at = datetime.now(UTC)
    session.flush()
    return task
