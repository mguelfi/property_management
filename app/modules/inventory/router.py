from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.pagination import Page, PageParams, page_params
from app.core.rbac import require
from app.core.security import CurrentUserDep

from . import service
from .models import Room, RoomBlock, RoomType
from .schemas import (
    PropertyOut,
    PropertyUpdate,
    RoomBlockIn,
    RoomBlockOut,
    RoomBlockUpdate,
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


def _room_out(room: Room) -> RoomOut:
    out = RoomOut.model_validate(room)
    out.adjoining_room_number = room.adjoining_room.number if room.adjoining_room else None
    return out


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


@router.get("/room-types/{room_type_id}", response_model=RoomTypeOut, dependencies=[view])
def get_room_type(room_type_id: int, db: DbDep) -> RoomType:
    return service.get_room_type(db, room_type_id)


@router.patch("/room-types/{room_type_id}", response_model=RoomTypeOut, dependencies=[manage])
def update_room_type(room_type_id: int, payload: RoomTypeUpdate, db: DbDep) -> RoomType:
    return service.update_room_type(db, room_type_id, payload.model_dump(exclude_unset=True))


@router.delete("/room-types/{room_type_id}", status_code=204, dependencies=[manage])
def deactivate_room_type(room_type_id: int, db: DbDep) -> None:
    service.deactivate_room_type(db, room_type_id)


@router.get("/rooms", response_model=list[RoomOut], dependencies=[view])
def list_rooms(
    db: DbDep,
    room_type_id: Annotated[int | None, Query()] = None,
    include_inactive: Annotated[bool, Query()] = False,
) -> list[RoomOut]:
    stmt = select(Room).order_by(Room.number)
    if room_type_id is not None:
        stmt = stmt.where(Room.room_type_id == room_type_id)
    if not include_inactive:
        stmt = stmt.where(Room.is_active.is_(True))
    return [_room_out(r) for r in db.scalars(stmt)]


@router.get("/rooms/paginated", response_model=Page[RoomOut], dependencies=[view])
def list_rooms_paginated(
    db: DbDep,
    params: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query()] = None,
    floor: Annotated[str | None, Query()] = None,
    room_type_id: Annotated[int | None, Query()] = None,
    is_active: Annotated[bool | None, Query()] = None,
) -> Page[RoomOut]:
    rows, total = service.list_rooms_paginated(
        db, params=params, q=q, floor=floor, room_type_id=room_type_id, is_active=is_active
    )
    return Page[RoomOut](
        items=[_room_out(r) for r in rows],
        total=total,
        limit=params.limit,
        offset=params.offset,
    )


@router.get("/rooms/floors", response_model=list[str], dependencies=[view])
def list_floors(db: DbDep) -> list[str]:
    return service.list_floors(db)


@router.post("/rooms", response_model=RoomOut, status_code=201, dependencies=[manage])
def create_room(payload: RoomIn, db: DbDep) -> RoomOut:
    return _room_out(service.create_room(db, payload.model_dump()))


@router.get("/rooms/{room_id}", response_model=RoomOut, dependencies=[view])
def get_room(room_id: int, db: DbDep) -> RoomOut:
    return _room_out(service.get_room(db, room_id))


@router.patch("/rooms/{room_id}", response_model=RoomOut, dependencies=[manage])
def update_room(room_id: int, payload: RoomUpdate, db: DbDep) -> RoomOut:
    return _room_out(service.update_room(db, room_id, payload.model_dump(exclude_unset=True)))


@router.delete("/rooms/{room_id}", status_code=204, dependencies=[manage])
def deactivate_room(room_id: int, db: DbDep) -> None:
    service.deactivate_room(db, room_id)


@router.get("/blocks", response_model=list[RoomBlockOut], dependencies=[view])
def list_blocks(db: DbDep) -> list[RoomBlock]:
    return list(db.scalars(select(RoomBlock).order_by(RoomBlock.start_date)))


@router.post("/blocks", response_model=RoomBlockOut, status_code=201, dependencies=[manage])
def create_block(payload: RoomBlockIn, db: DbDep, user: CurrentUserDep) -> RoomBlock:
    data = payload.model_dump()
    data["created_by"] = user.id
    return service.create_block(db, data)


@router.patch("/blocks/{block_id}", response_model=RoomBlockOut, dependencies=[manage])
def update_block(block_id: int, payload: RoomBlockUpdate, db: DbDep) -> RoomBlock:
    return service.update_block(db, block_id, payload.model_dump(exclude_unset=True))


@router.delete("/blocks/{block_id}", status_code=204, dependencies=[manage])
def delete_block(block_id: int, db: DbDep) -> None:
    service.delete_block(db, block_id)
