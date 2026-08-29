from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rbac import require

from . import service
from .models import Room, RoomBlock, RoomType
from .schemas import (
    PropertyOut,
    PropertyUpdate,
    RoomBlockIn,
    RoomBlockOut,
    RoomIn,
    RoomOut,
    RoomTypeIn,
    RoomTypeOut,
    RoomTypeUpdate,
    RoomUpdate,
)

router = APIRouter()
DbDep = Annotated[Session, Depends(get_db)]
view = require("inventory.view")
manage = require("inventory.manage")


@router.get("/property", response_model=PropertyOut, dependencies=[view])
def get_property(db: DbDep) -> object:
    return service.get_property(db)


@router.patch("/property", response_model=PropertyOut, dependencies=[manage])
def update_property(payload: PropertyUpdate, db: DbDep) -> object:
    prop = service.ensure_property(db)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(prop, key, value)
    db.flush()
    return prop


@router.get("/room-types", response_model=list[RoomTypeOut], dependencies=[view])
def list_room_types(
    db: DbDep, include_inactive: Annotated[bool, Query()] = False
) -> list[RoomType]:
    stmt = select(RoomType).order_by(RoomType.sort_order, RoomType.code)
    if not include_inactive:
        stmt = stmt.where(RoomType.is_active.is_(True))
    return list(db.scalars(stmt))


@router.post("/room-types", response_model=RoomTypeOut, status_code=201, dependencies=[manage])
def create_room_type(payload: RoomTypeIn, db: DbDep) -> RoomType:
    return service.create_room_type(db, payload.model_dump())


@router.patch("/room-types/{room_type_id}", response_model=RoomTypeOut, dependencies=[manage])
def update_room_type(room_type_id: int, payload: RoomTypeUpdate, db: DbDep) -> RoomType:
    return service.update_room_type(db, room_type_id, payload.model_dump(exclude_unset=True))


@router.get("/rooms", response_model=list[RoomOut], dependencies=[view])
def list_rooms(
    db: DbDep,
    room_type_id: Annotated[int | None, Query()] = None,
    include_inactive: Annotated[bool, Query()] = False,
) -> list[Room]:
    stmt = select(Room).order_by(Room.number)
    if room_type_id is not None:
        stmt = stmt.where(Room.room_type_id == room_type_id)
    if not include_inactive:
        stmt = stmt.where(Room.is_active.is_(True))
    return list(db.scalars(stmt))


@router.post("/rooms", response_model=RoomOut, status_code=201, dependencies=[manage])
def create_room(payload: RoomIn, db: DbDep) -> Room:
    return service.create_room(db, payload.model_dump())


@router.patch("/rooms/{room_id}", response_model=RoomOut, dependencies=[manage])
def update_room(room_id: int, payload: RoomUpdate, db: DbDep) -> Room:
    return service.update_room(db, room_id, payload.model_dump(exclude_unset=True))


@router.get("/blocks", response_model=list[RoomBlockOut], dependencies=[view])
def list_blocks(db: DbDep) -> list[RoomBlock]:
    return list(db.scalars(select(RoomBlock).order_by(RoomBlock.start_date)))


@router.post("/blocks", response_model=RoomBlockOut, status_code=201, dependencies=[manage])
def create_block(payload: RoomBlockIn, db: DbDep) -> RoomBlock:
    return service.create_block(db, payload.model_dump())


@router.delete("/blocks/{block_id}", status_code=204, dependencies=[manage])
def delete_block(block_id: int, db: DbDep) -> None:
    service.delete_block(db, block_id)
