from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import and_, select
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.sql.elements import ColumnElement

from app.core.daterange import nights, overlaps
from app.core.enums import ChargeCategory
from app.core.errors import Conflict, NotFound, ValidationProblem
from app.core.events import bus
from app.core.service_registry import get_service
from app.core.services import FolioService, RatesService
from app.modules.inventory.models import Room, RoomBlock
from app.modules.reservations import service as res_service
from app.modules.reservations.models import (
    ACTIVE_STATUSES,
    Reservation,
    ReservationRoom,
    ReservationStatus,
)

from .events import GuestCheckedIn, GuestCheckedOut, NightAuditRun, RoomAssigned, RoomUpgraded
from .models import AssignmentAction, RoomAssignmentLog
from .schemas import UpgradeChargeIn


def _now() -> datetime:
    return datetime.now(UTC)


def _folio() -> FolioService:
    return get_service(FolioService)


def _rates() -> RatesService:
    return get_service(RatesService)


def get_line(session: Session, reservation: Reservation, line_id: int) -> ReservationRoom:
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


@dataclass(frozen=True, kw_only=True)
class AssignResult:
    line: ReservationRoom
    audit_event_id: int | None


def assign_room(
    session: Session,
    *,
    reservation_id: int,
    line_id: int,
    room_id: int,
    actor_id: int | None,
    allow_type_mismatch: bool = False,
    note: str = "",
) -> AssignResult:
    reservation = res_service.get_reservation(session, reservation_id)
    if reservation.status not in (
        ReservationStatus.confirmed,
        ReservationStatus.in_house,
    ):
        raise Conflict(f"Cannot assign rooms in status {reservation.status.value}")
    line = get_line(session, reservation, line_id)
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
    event = RoomAssigned(
        reservation_room_id=line.id,
        room_id=room_id,
        previous_room_id=previous,
        actor_id=actor_id,
    )
    bus.publish(event, session)
    return AssignResult(line=line, audit_event_id=event.undo_context.get("audit_event_id"))


def release_room(
    session: Session, *, reservation_id: int, line_id: int, actor_id: int | None
) -> AssignResult:
    """Clear a line's room assignment (undo of a first-time assignment, which
    has no previous room to fall back to)."""
    reservation = res_service.get_reservation(session, reservation_id)
    if reservation.status is ReservationStatus.in_house:
        raise Conflict("Cannot unassign a room while the guest is checked in")
    line = get_line(session, reservation, line_id)
    previous = line.assigned_room_id
    line.assigned_room_id = None
    session.add(
        RoomAssignmentLog(
            reservation_room_id=line.id,
            room_id=None,
            previous_room_id=previous,
            action=AssignmentAction.released.value,
            at=_now(),
            by=actor_id,
            note="undo of assignment",
        )
    )
    session.flush()
    event = RoomAssigned(
        reservation_room_id=line.id,
        room_id=None,
        previous_room_id=previous,
        actor_id=actor_id,
    )
    bus.publish(event, session)
    return AssignResult(line=line, audit_event_id=event.undo_context.get("audit_event_id"))


@dataclass(frozen=True, kw_only=True)
class UpgradeQuote:
    """A read-only suggestion for the price of upgrading a line into
    ``candidate_room`` — never enforced; staff may charge any amount."""

    nights: int
    room_type_delta_minor: int
    view_surcharge_minor: int
    total_minor: int
    from_view_id: int | None
    to_view_id: int | None


def price_upgrade(
    session: Session, *, line: ReservationRoom, candidate_room: Room
) -> UpgradeQuote:
    night_count = (line.departure - line.arrival).days

    room_type_delta = 0
    if candidate_room.room_type_id != line.room_type_id:
        rates = _rates()
        for day in nights(line.arrival, line.departure):
            new_amt = rates.nightly_amount(
                session,
                rate_plan_id=line.rate_plan_id,
                room_type_id=candidate_room.room_type_id,
                day=day,
            )
            old_amt = rates.nightly_amount(
                session, rate_plan_id=line.rate_plan_id, room_type_id=line.room_type_id, day=day
            )
            room_type_delta += max((new_amt or 0) - (old_amt or 0), 0)

    current_room = (
        session.get(Room, line.assigned_room_id) if line.assigned_room_id else None
    )
    from_view = current_room.view if current_room else None
    to_view = candidate_room.view
    view_surcharge = 0
    if to_view is not None and (from_view is None or to_view.sort_order > from_view.sort_order):
        view_surcharge = to_view.surcharge_minor * night_count

    return UpgradeQuote(
        nights=night_count,
        room_type_delta_minor=room_type_delta,
        view_surcharge_minor=view_surcharge,
        total_minor=room_type_delta + view_surcharge,
        from_view_id=from_view.id if from_view else None,
        to_view_id=to_view.id if to_view else None,
    )


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
                result = assign_room(
                    session,
                    reservation_id=reservation_id,
                    line_id=line.id,
                    room_id=room.id,
                    actor_id=actor_id,
                    note="auto-assigned",
                )
                assigned.append(result.line)
                break
        else:
            raise Conflict(
                f"No free room of type {line.room_type_id} for line {line.id}"
            )
    return assigned


@dataclass(frozen=True, kw_only=True)
class CheckInResult:
    reservation: Reservation
    audit_event_id: int | None


def check_in(
    session: Session,
    *,
    reservation_id: int,
    actor_id: int | None,
    upgrades: Sequence[UpgradeChargeIn] = (),
) -> CheckInResult:
    reservation = res_service.get_reservation(session, reservation_id)
    unassigned = [ln.id for ln in reservation.rooms if ln.assigned_room_id is None]
    if unassigned:
        raise Conflict(f"All rooms must be assigned before check-in (missing: {unassigned})")
    res_service.mark_in_house(session, reservation)
    folio_id = _folio().get_or_open_folio(session, reservation_id=reservation_id)

    for upgrade in upgrades:
        line = get_line(session, reservation, upgrade.line_id)
        room = session.get(Room, line.assigned_room_id) if line.assigned_room_id else None
        description = upgrade.description or f"Room upgrade — {room.number if room else line.id}"
        folio_line_id: int | None = None
        if upgrade.amount_minor > 0:
            folio_line_id = _folio().post_charge(
                session,
                folio_id=folio_id,
                category=ChargeCategory.upgrade,
                description=description,
                amount_minor=upgrade.amount_minor,
                actor_id=actor_id,
                source="upgrade",
                reference=f"line:{line.id}",
            )
        bus.publish(
            RoomUpgraded(
                reservation_id=reservation.id,
                line_id=line.id,
                room_id=line.assigned_room_id or 0,
                from_view_id=upgrade.from_view_id,
                to_view_id=upgrade.to_view_id,
                charge_amount_minor=upgrade.amount_minor,
                folio_line_id=folio_line_id,
                actor_id=actor_id,
            ),
            session,
        )

    room_ids = tuple(ln.assigned_room_id for ln in reservation.rooms if ln.assigned_room_id)
    event = GuestCheckedIn(
        reservation_id=reservation.id,
        reference=reservation.reference,
        room_ids=room_ids,
        actor_id=actor_id,
    )
    bus.publish(event, session)
    return CheckInResult(
        reservation=reservation, audit_event_id=event.undo_context.get("audit_event_id")
    )


@dataclass(frozen=True, kw_only=True)
class CheckOutResult:
    reservation: Reservation
    audit_event_id: int | None


def check_out(
    session: Session,
    *,
    reservation_id: int,
    actor_id: int | None,
    allow_balance: bool = False,
) -> CheckOutResult:
    reservation = res_service.get_reservation(session, reservation_id)
    folio_id = _folio().get_or_open_folio(session, reservation_id=reservation_id)
    balance = _folio().balance_minor(session, folio_id=folio_id)
    if balance != 0 and not allow_balance:
        raise Conflict(
            f"Folio balance is {balance} {reservation.currency}; settle it or override"
        )
    res_service.mark_checked_out(session, reservation)
    room_ids = tuple(ln.assigned_room_id for ln in reservation.rooms if ln.assigned_room_id)
    folio_closed = False
    if balance == 0:
        _folio().close_folio(session, folio_id=folio_id)
        folio_closed = True
    event = GuestCheckedOut(
        reservation_id=reservation.id,
        reference=reservation.reference,
        room_ids=room_ids,
        folio_id=folio_id,
        folio_closed_by_this_action=folio_closed,
        actor_id=actor_id,
    )
    bus.publish(event, session)
    return CheckOutResult(
        reservation=reservation, audit_event_id=event.undo_context.get("audit_event_id")
    )


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


def post_room_charges(session: Session, night: date) -> int:
    """Post the night's room charge (+ tax) to each in-house folio.

    Idempotent: each ``ReservationRoomNight`` is flagged ``posted`` once its
    charge has been pushed, so re-running for the same night is a no-op.
    """
    folio = _folio()
    reservations = session.scalars(
        select(Reservation)
        .where(Reservation.status == ReservationStatus.in_house)
        .options(selectinload(Reservation.rooms).selectinload(ReservationRoom.nightly_rates))
    )
    posted = 0
    for reservation in reservations:
        folio_id = folio.get_or_open_folio(session, reservation_id=reservation.id)
        for room in reservation.rooms:
            for rn in room.nightly_rates:
                if rn.date != night or rn.posted:
                    continue
                folio.post_charge(
                    session,
                    folio_id=folio_id,
                    category=ChargeCategory.room,
                    description=f"Room {room.room_type_id} - night of {night.isoformat()}",
                    amount_minor=rn.amount_minor,
                    source="night_audit",
                    reference=f"{reservation.reference}/{rn.id}",
                )
                rn.posted = True
                posted += 1
    session.flush()
    return posted


@dataclass(frozen=True, kw_only=True)
class NightAuditResult:
    as_of: date
    night: date
    charges_posted: int
    no_shows_marked: int


def run_night_audit(
    session: Session, *, as_of: date, actor_id: int | None
) -> NightAuditResult:
    night = as_of - timedelta(days=1)
    charges_posted = post_room_charges(session, night)
    no_shows = no_show_sweep(session, as_of)
    result = NightAuditResult(
        as_of=as_of,
        night=night,
        charges_posted=charges_posted,
        no_shows_marked=len(no_shows),
    )
    bus.publish(
        NightAuditRun(
            as_of=as_of,
            night=night,
            charges_posted=charges_posted,
            no_shows_marked=len(no_shows),
            actor_id=actor_id,
        ),
        session,
    )
    return result
