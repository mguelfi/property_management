from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import distinct, select
from sqlalchemy.orm import Session, lazyload

from app.core.config import get_settings
from app.core.errors import NotFound, ValidationProblem
from app.core.pagination import PageParams, paginate

from .models import Property, Room, RoomBlock, RoomType

PROPERTY_ID = 1
_UNSET = object()


def get_property(session: Session) -> Property:
    prop = session.get(Property, PROPERTY_ID)
    if prop is None:
        raise NotFound("Property is not configured yet")
    return prop


def ensure_property(session: Session) -> Property:
    """Idempotently create the singleton property row (used by seed / first run)."""
    prop = session.get(Property, PROPERTY_ID)
    if prop is None:
        settings = get_settings()
        prop = Property(
            id=PROPERTY_ID,
            name="My Property",
            timezone=settings.default_timezone,
            currency=settings.default_currency,
        )
        session.add(prop)
        session.flush()
    return prop


def property_currency(session: Session) -> str:
    prop = session.get(Property, PROPERTY_ID)
    return prop.currency if prop else get_settings().default_currency


def get_room_type(session: Session, room_type_id: int) -> RoomType:
    rt = session.get(RoomType, room_type_id)
    if rt is None:
        raise NotFound("Room type not found")
    return rt


def create_room_type(session: Session, data: dict[str, Any]) -> RoomType:
    if session.scalar(select(RoomType).where(RoomType.code == data["code"])):
        raise ValidationProblem("Room type code already exists")
    rt = RoomType(**data)
    session.add(rt)
    session.flush()
    return rt


def update_room_type(session: Session, room_type_id: int, changes: dict[str, Any]) -> RoomType:
    rt = get_room_type(session, room_type_id)
    for key, value in changes.items():
        setattr(rt, key, value)
    session.flush()
    return rt


def deactivate_room_type(session: Session, room_type_id: int) -> RoomType:
    """Soft-delete: RoomType is a plain FK target (rate plans, reservations) with
    no ``ON DELETE``, so it is never hard-deleted."""
    rt = get_room_type(session, room_type_id)
    rt.is_active = False
    session.flush()
    return rt


def get_room(session: Session, room_id: int) -> Room:
    room = session.get(Room, room_id)
    if room is None:
        raise NotFound("Room not found")
    return room


def create_room(session: Session, data: dict[str, Any]) -> Room:
    if session.scalar(select(Room).where(Room.number == data["number"])):
        raise ValidationProblem("Room number already exists")
    get_room_type(session, int(data["room_type_id"]))  # validate FK
    room = Room(**data)
    session.add(room)
    session.flush()
    return room


def update_room(session: Session, room_id: int, changes: dict[str, Any]) -> Room:
    room = get_room(session, room_id)
    adjoining = changes.pop("adjoining_room_id", _UNSET)
    if "room_type_id" in changes:
        get_room_type(session, int(changes["room_type_id"]))
    for key, value in changes.items():
        setattr(room, key, value)
    session.flush()
    if adjoining is not _UNSET:
        set_adjoining_room(session, room_id, adjoining)  # type: ignore[arg-type]
    return room


def _lock_room(session: Session, room_id: int) -> Room | None:
    """Row-lock a single room without the default joined eager loads (``FOR UPDATE``
    cannot touch the nullable side of an outer join)."""
    return session.scalars(
        select(Room)
        .where(Room.id == room_id)
        .options(lazyload(Room.room_type), lazyload(Room.adjoining_room))
        .with_for_update(of=Room)
    ).one_or_none()


def set_adjoining_room(
    session: Session, room_id: int, adjoining_room_id: int | None
) -> Room:
    """Link two rooms as adjoining, kept symmetric on both sides.

    Setting A's partner to B also sets B's to A; clearing one clears the other.
    If B already had a different partner C, C is detached first.
    """
    room = _lock_room(session, room_id)
    if room is None:
        raise NotFound("Room not found")
    if room.adjoining_room_id == adjoining_room_id:
        return room

    # detach the current partner (if it points back at us)
    if room.adjoining_room_id is not None:
        old = _lock_room(session, room.adjoining_room_id)
        if old is not None and old.adjoining_room_id == room.id:
            old.adjoining_room_id = None

    if adjoining_room_id is None:
        room.adjoining_room_id = None
        session.flush()
        return room

    if adjoining_room_id == room.id:
        raise ValidationProblem("A room cannot adjoin itself")
    target = _lock_room(session, adjoining_room_id)
    if target is None:
        raise NotFound("Adjoining room not found")

    # target already paired with a third room -> break that pair
    if target.adjoining_room_id is not None and target.adjoining_room_id != room.id:
        third = _lock_room(session, target.adjoining_room_id)
        if third is not None and third.adjoining_room_id == target.id:
            third.adjoining_room_id = None

    room.adjoining_room_id = target.id
    target.adjoining_room_id = room.id
    session.flush()
    return room


def deactivate_room(session: Session, room_id: int) -> Room:
    room = get_room(session, room_id)
    set_adjoining_room(session, room_id, None)
    room.is_active = False
    session.flush()
    return room


def list_rooms_paginated(
    session: Session,
    *,
    params: PageParams,
    q: str | None = None,
    floor: str | None = None,
    room_type_id: int | None = None,
    is_active: bool | None = None,
) -> tuple[list[Room], int]:
    stmt = select(Room).order_by(Room.floor, Room.number)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Room.number.ilike(like) | Room.name.ilike(like))
    if floor is not None:
        stmt = stmt.where(Room.floor == floor)
    if room_type_id is not None:
        stmt = stmt.where(Room.room_type_id == room_type_id)
    if is_active is not None:
        stmt = stmt.where(Room.is_active.is_(is_active))
    return paginate(session, stmt, params)


def list_floors(session: Session) -> list[str]:
    rows = session.scalars(
        select(distinct(Room.floor)).where(Room.floor != "").order_by(Room.floor)
    )
    return list(rows)


def create_block(session: Session, data: dict[str, Any]) -> RoomBlock:
    if data.get("room_id") is not None:
        get_room(session, int(data["room_id"]))
    if data.get("room_type_id") is not None:
        get_room_type(session, int(data["room_type_id"]))
    block = RoomBlock(**data)
    session.add(block)
    session.flush()
    return block


def get_block(session: Session, block_id: int) -> RoomBlock:
    block = session.get(RoomBlock, block_id)
    if block is None:
        raise NotFound("Block not found")
    return block


def update_block(session: Session, block_id: int, changes: dict[str, Any]) -> RoomBlock:
    block = get_block(session, block_id)
    for key, value in changes.items():
        if value is not None:
            setattr(block, key, value)
    start: date = block.start_date
    end: date = block.end_date
    if end <= start:
        raise ValidationProblem("end_date must be after start_date")
    session.flush()
    return block


def delete_block(session: Session, block_id: int) -> None:
    session.delete(get_block(session, block_id))
