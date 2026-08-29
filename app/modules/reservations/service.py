from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import Conflict, InvalidTransition, NotFound, ValidationProblem
from app.core.events import bus
from app.core.service_registry import get_service
from app.core.services import AvailabilityService
from app.modules.guests.models import Guest
from app.modules.inventory.service import property_currency
from app.modules.rates.models import RatePlan

from .events import (
    ReservationCancelled,
    ReservationConfirmed,
    ReservationModified,
    ReservationNoShow,
)
from .models import (
    ACTIVE_STATUSES,
    Reservation,
    ReservationRoom,
    ReservationRoomNight,
    ReservationStatus,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _availability() -> AvailabilityService:
    return get_service(AvailabilityService)


def get_reservation(session: Session, reservation_id: int) -> Reservation:
    res = session.scalar(
        select(Reservation)
        .where(Reservation.id == reservation_id)
        .options(selectinload(Reservation.rooms).selectinload(ReservationRoom.nightly_rates))
    )
    if res is None:
        raise NotFound("Reservation not found")
    return res


def _holds_inventory(status: ReservationStatus) -> bool:
    return status in ACTIVE_STATUSES


def _reserve_rooms(session: Session, res: Reservation) -> None:
    avail = _availability()
    for room in res.rooms:
        avail.reserve(
            session,
            room_type_id=room.room_type_id,
            arrival=room.arrival,
            departure=room.departure,
            units=1,
        )


def _release_rooms(session: Session, res: Reservation) -> None:
    avail = _availability()
    for room in res.rooms:
        avail.release(
            session,
            room_type_id=room.room_type_id,
            arrival=room.arrival,
            departure=room.departure,
            units=1,
        )


def _build_rooms(
    session: Session, res: Reservation, room_payloads: list[dict[str, Any]]
) -> None:
    avail = _availability()
    currency = property_currency(session)
    total = 0
    arrivals: list[date] = []
    departures: list[date] = []

    for rp in room_payloads:
        plan = session.get(RatePlan, rp["rate_plan_id"])
        if plan is None:
            raise NotFound(f"Rate plan {rp['rate_plan_id']} not found")
        quote = avail.quote(
            session,
            room_type_id=rp["room_type_id"],
            rate_plan_id=rp["rate_plan_id"],
            arrival=rp["arrival"],
            departure=rp["departure"],
        )
        if quote.currency != currency:
            raise ValidationProblem(
                f"Rate plan currency {quote.currency} != property currency {currency}"
            )
        room = ReservationRoom(
            room_type_id=rp["room_type_id"],
            rate_plan_id=rp["rate_plan_id"],
            arrival=rp["arrival"],
            departure=rp["departure"],
            adults=rp.get("adults", 2),
            children=rp.get("children", 0),
            guest_name=rp.get("guest_name", "") or "",
            rate_total_minor=quote.total_minor,
        )
        room.nightly_rates = [
            ReservationRoomNight(date=n.date, amount_minor=n.amount_minor)
            for n in quote.nights
        ]
        res.rooms.append(room)
        total += quote.total_minor
        arrivals.append(rp["arrival"])
        departures.append(rp["departure"])

    res.currency = currency
    res.total_minor = total
    res.arrival = min(arrivals)
    res.departure = max(departures)

    # Cancellation policy snapshot from the earliest-arriving room's plan.
    earliest = min(res.rooms, key=lambda r: r.arrival)
    plan = session.get(RatePlan, earliest.rate_plan_id)
    if plan is not None:
        res.cancellation_note = plan.cancellation_note
        res.cancellation_penalty_nights = plan.cancellation_penalty_nights
        res.free_cancel_until = date.fromordinal(
            earliest.arrival.toordinal() - plan.free_cancel_until_days
        )


def create_reservation(
    session: Session, *, payload: dict[str, Any], actor_id: int | None
) -> Reservation:
    if session.get(Guest, payload["primary_guest_id"]) is None:
        raise NotFound("Primary guest not found")
    if not payload.get("rooms"):
        raise ValidationProblem("At least one room is required")

    status = ReservationStatus(payload.get("status", ReservationStatus.confirmed.value))
    if status not in (ReservationStatus.inquiry, ReservationStatus.confirmed):
        raise ValidationProblem("New reservations must be 'inquiry' or 'confirmed'")

    res = Reservation(
        reference="",
        status=status,
        source=payload.get("source", "direct"),
        channel_name=payload.get("channel_name", "") or "",
        external_reference=payload.get("external_reference", "") or "",
        primary_guest_id=payload["primary_guest_id"],
        company_id=payload.get("company_id"),
        currency="",
        arrival=date.today(),
        departure=date.today(),
        notes=payload.get("notes", "") or "",
        created_by=actor_id,
    )
    session.add(res)
    _build_rooms(session, res, payload["rooms"])
    session.flush()
    res.reference = f"R{res.id:06d}"

    if _holds_inventory(status):
        _reserve_rooms(session, res)

    session.flush()
    if status is ReservationStatus.confirmed:
        bus.publish(
            ReservationConfirmed(
                reservation_id=res.id, reference=res.reference, actor_id=actor_id
            ),
            session,
        )
    return res


def confirm(session: Session, res: Reservation, *, actor_id: int | None = None) -> Reservation:
    if res.status is ReservationStatus.confirmed:
        return res
    if res.status is not ReservationStatus.inquiry:
        raise InvalidTransition(f"Cannot confirm a reservation in status {res.status.value}")
    _reserve_rooms(session, res)
    res.status = ReservationStatus.confirmed
    session.flush()
    bus.publish(
        ReservationConfirmed(reservation_id=res.id, reference=res.reference, actor_id=actor_id),
        session,
    )
    return res


def cancel(
    session: Session, res: Reservation, *, reason: str, actor_id: int | None = None
) -> Reservation:
    if res.status in (ReservationStatus.checked_out, ReservationStatus.cancelled):
        raise InvalidTransition(f"Cannot cancel a reservation in status {res.status.value}")
    if res.status is ReservationStatus.in_house:
        raise Conflict("Guest is in-house; check out instead of cancelling")
    if _holds_inventory(res.status):
        _release_rooms(session, res)
    res.status = ReservationStatus.cancelled
    res.cancelled_at = _now()
    res.cancellation_reason = reason
    session.flush()
    bus.publish(
        ReservationCancelled(
            reservation_id=res.id, reference=res.reference, reason=reason, actor_id=actor_id
        ),
        session,
    )
    return res


def no_show(session: Session, res: Reservation, *, actor_id: int | None = None) -> Reservation:
    if res.status is not ReservationStatus.confirmed:
        raise InvalidTransition(
            f"Only confirmed reservations can be marked no-show (is {res.status.value})"
        )
    _release_rooms(session, res)
    res.status = ReservationStatus.no_show
    res.cancelled_at = _now()
    session.flush()
    bus.publish(
        ReservationNoShow(reservation_id=res.id, reference=res.reference, actor_id=actor_id),
        session,
    )
    return res


def mark_in_house(session: Session, res: Reservation) -> None:
    if res.status is not ReservationStatus.confirmed:
        raise InvalidTransition(
            f"Cannot check in a reservation in status {res.status.value}"
        )
    res.status = ReservationStatus.in_house
    res.checked_in_at = _now()
    session.flush()


def mark_checked_out(session: Session, res: Reservation) -> None:
    if res.status is not ReservationStatus.in_house:
        raise InvalidTransition(
            f"Cannot check out a reservation in status {res.status.value}"
        )
    res.status = ReservationStatus.checked_out
    res.checked_out_at = _now()
    session.flush()


def modify_rooms(
    session: Session,
    res: Reservation,
    *,
    room_payloads: list[dict[str, Any]],
    actor_id: int | None = None,
) -> Reservation:
    if res.status not in (ReservationStatus.inquiry, ReservationStatus.confirmed):
        raise Conflict(f"Cannot modify a reservation in status {res.status.value}")
    if not room_payloads:
        raise ValidationProblem("At least one room is required")

    held = _holds_inventory(res.status)
    if held:
        _release_rooms(session, res)
    res.rooms.clear()
    session.flush()
    _build_rooms(session, res, room_payloads)
    session.flush()
    if held:
        _reserve_rooms(session, res)
    session.flush()
    bus.publish(
        ReservationModified(
            reservation_id=res.id, reference=res.reference, actor_id=actor_id
        ),
        session,
    )
    return res


def search(
    session: Session,
    *,
    status: ReservationStatus | None = None,
    arriving_on: date | None = None,
    in_house_on: date | None = None,
    guest_id: int | None = None,
    query: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Reservation], int]:
    from sqlalchemy import func

    stmt = select(Reservation)
    if status is not None:
        stmt = stmt.where(Reservation.status == status)
    if arriving_on is not None:
        stmt = stmt.where(Reservation.arrival == arriving_on)
    if in_house_on is not None:
        stmt = stmt.where(
            Reservation.arrival <= in_house_on, Reservation.departure > in_house_on
        )
    if guest_id is not None:
        stmt = stmt.where(Reservation.primary_guest_id == guest_id)
    if query:
        like = f"%{query}%"
        stmt = stmt.where(
            or_(Reservation.reference.ilike(like), Reservation.external_reference.ilike(like))
        )
    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        session.scalars(
            stmt.order_by(Reservation.arrival.desc(), Reservation.id.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    return rows, total
