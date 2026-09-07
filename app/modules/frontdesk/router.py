from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rbac import require
from app.core.security import CurrentUserDep
from app.modules.inventory import service as inv_service
from app.modules.reservations import service as res_service
from app.modules.reservations.models import Reservation
from app.modules.reservations.schemas import ReservationOut

from . import service
from .schemas import (
    ActionResult,
    ArrivalRow,
    AssignIn,
    CheckInIn,
    CheckOutIn,
    FrontDeskAction,
    NightAuditIn,
    NightAuditOut,
    UpgradeQuoteOut,
    WalkInCreate,
)

router = APIRouter()
DbDep = Annotated[Session, Depends(get_db)]
OnDate = Annotated[date | None, Query()]
operate = require("frontdesk.operate")
night_audit_perm = require("frontdesk.night_audit")


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
    response_model=ActionResult,
    dependencies=[operate],
)
def assign(
    reservation_id: int, line_id: int, payload: AssignIn, db: DbDep, user: CurrentUserDep
) -> ActionResult:
    result = service.assign_room(
        db,
        reservation_id=reservation_id,
        line_id=line_id,
        room_id=payload.room_id,
        actor_id=user.id,
        allow_type_mismatch=payload.allow_type_mismatch,
        note=payload.note,
    )
    return ActionResult(
        reservation=ReservationOut.model_validate(res_service.get_reservation(db, reservation_id)),
        audit_event_id=result.audit_event_id,
    )


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
    response_model=ActionResult,
    dependencies=[operate],
)
def checkin(
    reservation_id: int,
    db: DbDep,
    user: CurrentUserDep,
    payload: Annotated[CheckInIn, Body(default_factory=CheckInIn)],
) -> ActionResult:
    result = service.check_in(
        db, reservation_id=reservation_id, actor_id=user.id, upgrades=payload.upgrades
    )
    return ActionResult(
        reservation=ReservationOut.model_validate(result.reservation),
        audit_event_id=result.audit_event_id,
    )


@router.get(
    "/reservations/{reservation_id}/rooms/{line_id}/upgrade-quote",
    response_model=UpgradeQuoteOut,
    dependencies=[operate],
)
def upgrade_quote(
    reservation_id: int, line_id: int, room_id: int, db: DbDep
) -> UpgradeQuoteOut:
    reservation = res_service.get_reservation(db, reservation_id)
    line = service.get_line(db, reservation, line_id)
    candidate_room = inv_service.get_room(db, room_id)
    quote = service.price_upgrade(db, line=line, candidate_room=candidate_room)
    return UpgradeQuoteOut(
        nights=quote.nights,
        room_type_delta_minor=quote.room_type_delta_minor,
        view_surcharge_minor=quote.view_surcharge_minor,
        total_minor=quote.total_minor,
        from_view_id=quote.from_view_id,
        to_view_id=quote.to_view_id,
    )


@router.post(
    "/reservations/{reservation_id}/checkout",
    response_model=ActionResult,
    dependencies=[operate],
)
def checkout(
    reservation_id: int,
    payload: CheckOutIn,
    db: DbDep,
    user: CurrentUserDep,
) -> ActionResult:
    if payload.allow_balance:
        user.require("billing.checkout_with_balance")
    result = service.check_out(
        db,
        reservation_id=reservation_id,
        actor_id=user.id,
        allow_balance=payload.allow_balance,
    )
    return ActionResult(
        reservation=ReservationOut.model_validate(result.reservation),
        audit_event_id=result.audit_event_id,
    )


@router.post("/walk-ins", response_model=FrontDeskAction, status_code=201, dependencies=[operate])
def walk_in(payload: WalkInCreate, db: DbDep, user: CurrentUserDep) -> FrontDeskAction:
    data = payload.model_dump()
    data["source"] = "walk_in"
    data["status"] = "confirmed"
    reservation = res_service.create_reservation(db, payload=data, actor_id=user.id)
    service.auto_assign(db, reservation_id=reservation.id, actor_id=user.id)
    result = service.check_in(db, reservation_id=reservation.id, actor_id=user.id)
    return FrontDeskAction(
        reservation=ReservationOut.model_validate(result.reservation),
        message="Walk-in created, assigned and checked in",
    )


@router.post("/night-audit", response_model=NightAuditOut, dependencies=[night_audit_perm])
def night_audit(payload: NightAuditIn, db: DbDep, user: CurrentUserDep) -> NightAuditOut:
    result = service.run_night_audit(
        db, as_of=payload.as_of or date.today(), actor_id=user.id
    )
    return NightAuditOut(
        as_of=result.as_of,
        night=result.night,
        charges_posted=result.charges_posted,
        no_shows_marked=result.no_shows_marked,
    )
