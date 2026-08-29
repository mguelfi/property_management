from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rbac import require
from app.core.security import CurrentUserDep
from app.modules.reservations import service as res_service
from app.modules.reservations.models import Reservation
from app.modules.reservations.schemas import ReservationOut

from . import service
from .schemas import ArrivalRow, AssignIn, CheckOutIn, FrontDeskAction, WalkInCreate

router = APIRouter()
DbDep = Annotated[Session, Depends(get_db)]
OnDate = Annotated[date | None, Query()]
operate = require("frontdesk.operate")


@router.get("/arrivals", response_model=list[ArrivalRow], dependencies=[operate])
def arrivals(db: DbDep, on: OnDate = None) -> list[ArrivalRow]:
    return [_arrival_row(r) for r in service.arrivals(db, on or date.today())]


@router.get("/departures", response_model=list[ArrivalRow], dependencies=[operate])
def departures(db: DbDep, on: OnDate = None) -> list[ArrivalRow]:
    return [_arrival_row(r) for r in service.departures(db, on or date.today())]


@router.get("/in-house", response_model=list[ArrivalRow], dependencies=[operate])
def in_house(db: DbDep, on: OnDate = None) -> list[ArrivalRow]:
    return [_arrival_row(r) for r in service.in_house(db, on or date.today())]


def _arrival_row(r: Reservation) -> ArrivalRow:
    return ArrivalRow(
        id=r.id,
        reference=r.reference,
        primary_guest_id=r.primary_guest_id,
        arrival=r.arrival,
        departure=r.departure,
        status=r.status.value,
        unassigned_rooms=sum(1 for ln in r.rooms if ln.assigned_room_id is None),
    )


@router.post(
    "/reservations/{reservation_id}/rooms/{line_id}/assign",
    response_model=ReservationOut,
    dependencies=[operate],
)
def assign(
    reservation_id: int, line_id: int, payload: AssignIn, db: DbDep, user: CurrentUserDep
) -> ReservationOut:
    service.assign_room(
        db,
        reservation_id=reservation_id,
        line_id=line_id,
        room_id=payload.room_id,
        actor_id=user.id,
        allow_type_mismatch=payload.allow_type_mismatch,
        note=payload.note,
    )
    return ReservationOut.model_validate(res_service.get_reservation(db, reservation_id))


@router.post(
    "/reservations/{reservation_id}/auto-assign",
    response_model=ReservationOut,
    dependencies=[operate],
)
def auto_assign(reservation_id: int, db: DbDep, user: CurrentUserDep) -> ReservationOut:
    service.auto_assign(db, reservation_id=reservation_id, actor_id=user.id)
    return ReservationOut.model_validate(res_service.get_reservation(db, reservation_id))


@router.post(
    "/reservations/{reservation_id}/checkin",
    response_model=ReservationOut,
    dependencies=[operate],
)
def checkin(reservation_id: int, db: DbDep, user: CurrentUserDep) -> ReservationOut:
    res = service.check_in(db, reservation_id=reservation_id, actor_id=user.id)
    return ReservationOut.model_validate(res)


@router.post(
    "/reservations/{reservation_id}/checkout",
    response_model=ReservationOut,
    dependencies=[operate],
)
def checkout(
    reservation_id: int,
    payload: CheckOutIn,
    db: DbDep,
    user: CurrentUserDep,
) -> ReservationOut:
    if payload.allow_balance:
        user.require("billing.checkout_with_balance")
    res = service.check_out(
        db,
        reservation_id=reservation_id,
        actor_id=user.id,
        allow_balance=payload.allow_balance,
    )
    return ReservationOut.model_validate(res)


@router.post("/walk-ins", response_model=FrontDeskAction, status_code=201, dependencies=[operate])
def walk_in(payload: WalkInCreate, db: DbDep, user: CurrentUserDep) -> FrontDeskAction:
    data = payload.model_dump()
    data["source"] = "walk_in"
    data["status"] = "confirmed"
    reservation = res_service.create_reservation(db, payload=data, actor_id=user.id)
    service.auto_assign(db, reservation_id=reservation.id, actor_id=user.id)
    reservation = service.check_in(db, reservation_id=reservation.id, actor_id=user.id)
    return FrontDeskAction(
        reservation=ReservationOut.model_validate(reservation),
        message="Walk-in created, assigned and checked in",
    )
