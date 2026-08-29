from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import NotFound, ValidationProblem

from .models import Property, Room, RoomBlock, RoomType

PROPERTY_ID = 1


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
    if "room_type_id" in changes:
        get_room_type(session, int(changes["room_type_id"]))
    for key, value in changes.items():
        setattr(room, key, value)
    session.flush()
    return room


def create_block(session: Session, data: dict[str, Any]) -> RoomBlock:
    if data.get("room_id") is not None:
        get_room(session, int(data["room_id"]))
    if data.get("room_type_id") is not None:
        get_room_type(session, int(data["room_type_id"]))
    block = RoomBlock(**data)
    session.add(block)
    session.flush()
    return block


def delete_block(session: Session, block_id: int) -> None:
    block = session.get(RoomBlock, block_id)
    if block is None:
        raise NotFound("Block not found")
    session.delete(block)
