from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import and_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.daterange import overlaps
from app.core.errors import Conflict, NotFound, ValidationProblem
from app.core.events import bus
from app.core.service_registry import get_service
from app.core.services import FolioService
from app.modules.inventory.models import Room, RoomBlock
from app.modules.reservations import service as res_service
from app.modules.reservations.models import (
    ACTIVE_STATUSES,
    Reservation,
    ReservationRoom,
    ReservationStatus,
)

from .events import GuestCheckedIn, GuestCheckedOut, RoomAssigned
from .models import AssignmentAction, RoomAssignmentLog


def _now() -> datetime:
    return datetime.now(UTC)


def _folio() -> FolioService:
    return get_service(FolioService)


def _get_line(session: Session, reservation: Reservation, line_id: int) -> ReservationRoom:
    for line in reservation.rooms:
        if line.id == line_id:
            return line
    raise NotFound("Reservation room line not found")


def _room_conflicts(
    session: Session, room_id: int, arrival: date, departure: date, exclude_line_id: int
) -> bool:
    other = session.scalars(
        select(ReservationRoom)
        .join(Reservation, Reservation.id == ReservationRoom.reservation_id)
        .where(
            ReservationRoom.assigned_room_id == room_id,
            ReservationRoom.id != exclude_line_id,
            Reservation.status.in_(tuple(ACTIVE_STATUSES)),
        )
    )
    for line in other:
        if overlaps(arrival, departure, line.arrival, line.departure):
            return True
    blocks = session.scalars(
        select(RoomBlock).where(RoomBlock.room_id == room_id)
    )
    return any(overlaps(arrival, departure, b.start_date, b.end_date) for b in blocks)


def assign_room(
    session: Session,
    *,
    reservation_id: int,
    line_id: int,
    room_id: int,
    actor_id: int | None,
    allow_type_mismatch: bool = False,
    note: str = "",
) -> ReservationRoom:
    reservation = res_service.get_reservation(session, reservation_id)
    if reservation.status not in (
        ReservationStatus.confirmed,
        ReservationStatus.in_house,
    ):
        raise Conflict(f"Cannot assign rooms in status {reservation.status.value}")
    line = _get_line(session, reservation, line_id)
    room = session.get(Room, room_id)
    if room is None or not room.is_active:
        raise NotFound("Room not found or inactive")
    if room.room_type_id != line.room_type_id and not allow_type_mismatch:
        raise ValidationProblem(
            "Room type does not match the booked room type (set allow_type_mismatch to override)"
        )
    if _room_conflicts(session, room_id, line.arrival, line.departure, line.id):
        raise Conflict(f"Room {room.number} is not free for these dates")

    previous = line.assigned_room_id
    line.assigned_room_id = room_id
    session.add(
        RoomAssignmentLog(
            reservation_room_id=line.id,
            room_id=room_id,
            previous_room_id=previous,
            action=(AssignmentAction.moved if previous else AssignmentAction.assigned).value,
            at=_now(),
            by=actor_id,
            note=note,
        )
    )
    session.flush()
    bus.publish(
        RoomAssigned(
            reservation_room_id=line.id,
            room_id=room_id,
            previous_room_id=previous,
            actor_id=actor_id,
        ),
        session,
    )
    return line


def auto_assign(
    session: Session, *, reservation_id: int, actor_id: int | None
) -> list[ReservationRoom]:
    reservation = res_service.get_reservation(session, reservation_id)
    assigned: list[ReservationRoom] = []
    for line in reservation.rooms:
        if line.assigned_room_id is not None:
            continue
        candidates = session.scalars(
            select(Room)
            .where(Room.room_type_id == line.room_type_id, Room.is_active.is_(True))
            .order_by(Room.number)
        )
        for room in candidates:
            if not _room_conflicts(session, room.id, line.arrival, line.departure, line.id):
                assign_room(
                    session,
                    reservation_id=reservation_id,
                    line_id=line.id,
                    room_id=room.id,
                    actor_id=actor_id,
                    note="auto-assigned",
                )
                assigned.append(line)
                break
        else:
            raise Conflict(
                f"No free room of type {line.room_type_id} for line {line.id}"
            )
    return assigned


def check_in(
    session: Session, *, reservation_id: int, actor_id: int | None
) -> Reservation:
    reservation = res_service.get_reservation(session, reservation_id)
    unassigned = [ln.id for ln in reservation.rooms if ln.assigned_room_id is None]
    if unassigned:
        raise Conflict(f"All rooms must be assigned before check-in (missing: {unassigned})")
    res_service.mark_in_house(session, reservation)
    _folio().get_or_open_folio(session, reservation_id=reservation_id)
    room_ids = tuple(ln.assigned_room_id for ln in reservation.rooms if ln.assigned_room_id)
    bus.publish(
        GuestCheckedIn(
            reservation_id=reservation.id,
            reference=reservation.reference,
            room_ids=room_ids,
            actor_id=actor_id,
        ),
        session,
    )
    return reservation


def check_out(
    session: Session,
    *,
    reservation_id: int,
    actor_id: int | None,
    allow_balance: bool = False,
) -> Reservation:
    reservation = res_service.get_reservation(session, reservation_id)
    folio_id = _folio().get_or_open_folio(session, reservation_id=reservation_id)
    balance = _folio().balance_minor(session, folio_id=folio_id)
    if balance != 0 and not allow_balance:
        raise Conflict(
            f"Folio balance is {balance} {reservation.currency}; settle it or override"
        )
    res_service.mark_checked_out(session, reservation)
    room_ids = tuple(ln.assigned_room_id for ln in reservation.rooms if ln.assigned_room_id)
    if balance == 0:
        _folio().close_folio(session, folio_id=folio_id)
    bus.publish(
        GuestCheckedOut(
            reservation_id=reservation.id,
            reference=reservation.reference,
            room_ids=room_ids,
            actor_id=actor_id,
        ),
        session,
    )
    return reservation


def _list(session: Session, where: ColumnElement[bool]) -> list[Reservation]:
    return list(
        session.scalars(select(Reservation).where(where).order_by(Reservation.reference))
    )


def arrivals(session: Session, on: date) -> list[Reservation]:
    return _list(
        session,
        and_(
            Reservation.arrival == on,
            Reservation.status == ReservationStatus.confirmed,
        ),
    )


def departures(session: Session, on: date) -> list[Reservation]:
    return _list(
        session,
        and_(
            Reservation.departure == on,
            Reservation.status == ReservationStatus.in_house,
        ),
    )


def in_house(session: Session, on: date) -> list[Reservation]:
    return _list(
        session,
        and_(
            Reservation.status == ReservationStatus.in_house,
            Reservation.arrival <= on,
            Reservation.departure > on,
        ),
    )


def no_show_sweep(session: Session, as_of: date) -> list[int]:
    stale = session.scalars(
        select(Reservation).where(
            Reservation.status == ReservationStatus.confirmed,
            Reservation.arrival < as_of,
        )
    )
    marked: list[int] = []
    for reservation in stale:
        res_service.no_show(session, reservation)
        marked.append(reservation.id)
    return marked
