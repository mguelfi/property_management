from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.pagination import Page, PageParams, page_params
from app.core.rbac import require
from app.core.security import CurrentUserDep

from . import service
from .models import ReservationStatus
from .schemas import (
    CancelIn,
    ModifyRoomsIn,
    ReservationCreate,
    ReservationListItem,
    ReservationOut,
)

router = APIRouter()
DbDep = Annotated[Session, Depends(get_db)]
view = require("reservations.view")
manage = require("reservations.manage")


@router.get("", response_model=Page[ReservationListItem], dependencies=[view])
def list_reservations(
    db: DbDep,
    params: Annotated[PageParams, Depends(page_params)],
    status: Annotated[ReservationStatus | None, Query()] = None,
    arriving_on: Annotated[date | None, Query()] = None,
    in_house_on: Annotated[date | None, Query()] = None,
    guest_id: Annotated[int | None, Query()] = None,
    q: Annotated[str | None, Query()] = None,
) -> Page[ReservationListItem]:
    rows, total = service.search(
        db,
        status=status,
        arriving_on=arriving_on,
        in_house_on=in_house_on,
        guest_id=guest_id,
        query=q,
        limit=params.limit,
        offset=params.offset,
    )
    return Page[ReservationListItem](
        items=[ReservationListItem.model_validate(r) for r in rows],
        total=total,
        limit=params.limit,
        offset=params.offset,
    )


@router.post("", response_model=ReservationOut, status_code=201, dependencies=[manage])
def create_reservation(
    payload: ReservationCreate, db: DbDep, user: CurrentUserDep
) -> ReservationOut:
    res = service.create_reservation(db, payload=payload.model_dump(), actor_id=user.id)
    return ReservationOut.model_validate(res)


@router.get("/{reservation_id}", response_model=ReservationOut, dependencies=[view])
def get_reservation(reservation_id: int, db: DbDep) -> ReservationOut:
    return ReservationOut.model_validate(service.get_reservation(db, reservation_id))


@router.post("/{reservation_id}/confirm", response_model=ReservationOut, dependencies=[manage])
def confirm(reservation_id: int, db: DbDep, user: CurrentUserDep) -> ReservationOut:
    res = service.get_reservation(db, reservation_id)
    return ReservationOut.model_validate(service.confirm(db, res, actor_id=user.id))


@router.post("/{reservation_id}/cancel", response_model=ReservationOut, dependencies=[manage])
def cancel(
    reservation_id: int, payload: CancelIn, db: DbDep, user: CurrentUserDep
) -> ReservationOut:
    res = service.get_reservation(db, reservation_id)
    return ReservationOut.model_validate(
        service.cancel(db, res, reason=payload.reason, actor_id=user.id)
    )


@router.post("/{reservation_id}/no-show", response_model=ReservationOut, dependencies=[manage])
def no_show(reservation_id: int, db: DbDep, user: CurrentUserDep) -> ReservationOut:
    res = service.get_reservation(db, reservation_id)
    return ReservationOut.model_validate(service.no_show(db, res, actor_id=user.id))


@router.put("/{reservation_id}/rooms", response_model=ReservationOut, dependencies=[manage])
def modify_rooms(
    reservation_id: int, payload: ModifyRoomsIn, db: DbDep, user: CurrentUserDep
) -> ReservationOut:
    res = service.get_reservation(db, reservation_id)
    updated = service.modify_rooms(
        db,
        res,
        room_payloads=[r.model_dump() for r in payload.rooms],
        actor_id=user.id,
    )
    return ReservationOut.model_validate(updated)
