from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.daterange import night_count, nights
from app.core.errors import ValidationProblem
from app.modules.inventory.models import Room
from app.modules.inventory.service import property_currency
from app.modules.reservations.models import (
    Reservation,
    ReservationRoom,
    ReservationRoomNight,
    ReservationStatus,
)

from .schemas import ArrivalsDeparturesRow, OccupancySummary, RevenueSummary

_EXCLUDED_FROM_OCCUPANCY = (ReservationStatus.cancelled, ReservationStatus.no_show)


def _check_range(start: date, end: date) -> None:
    if end <= start:
        raise ValidationProblem("end must be after start")


def _active_room_count(session: Session) -> int:
    return (
        session.scalar(select(func.count()).select_from(Room).where(Room.is_active.is_(True)))
        or 0
    )


def _room_nights_query(start: date, end: date):
    return (
        select(ReservationRoomNight.date, ReservationRoomNight.amount_minor)
        .select_from(ReservationRoomNight)
        .join(ReservationRoom, ReservationRoom.id == ReservationRoomNight.reservation_room_id)
        .join(Reservation, Reservation.id == ReservationRoom.reservation_id)
        .where(
            ReservationRoomNight.date >= start,
            ReservationRoomNight.date < end,
            Reservation.status.not_in(_EXCLUDED_FROM_OCCUPANCY),
        )
    )


def occupancy_by_day(session: Session, start: date, end: date) -> list[OccupancySummary]:
    _check_range(start, end)
    rooms_total = _active_room_count(session)
    occupied_by_date: dict[date, int] = {}
    for night, _amount in session.execute(_room_nights_query(start, end)):
        occupied_by_date[night] = occupied_by_date.get(night, 0) + 1

    rows: list[OccupancySummary] = []
    for day in nights(start, end):
        occupied = occupied_by_date.get(day, 0)
        pct = round(occupied / rooms_total * 100, 1) if rooms_total else 0.0
        rows.append(
            OccupancySummary(
                date=day,
                rooms_total=rooms_total,
                rooms_occupied=occupied,
                occupancy_pct=pct,
            )
        )
    return rows


def revenue_summary(session: Session, start: date, end: date) -> RevenueSummary:
    _check_range(start, end)
    room_revenue_minor = 0
    room_nights_sold = 0
    for _night, amount_minor in session.execute(_room_nights_query(start, end)):
        room_revenue_minor += amount_minor
        room_nights_sold += 1

    adr_minor = round(room_revenue_minor / room_nights_sold) if room_nights_sold else 0
    rooms_total = _active_room_count(session)
    revpar_denom = rooms_total * night_count(start, end)
    revpar_minor = round(room_revenue_minor / revpar_denom) if revpar_denom else 0

    return RevenueSummary(
        start=start,
        end=end,
        room_revenue_minor=room_revenue_minor,
        room_nights_sold=room_nights_sold,
        adr_minor=adr_minor,
        revpar_minor=revpar_minor,
        currency=property_currency(session),
    )


def arrivals_departures(session: Session, start: date, end: date) -> list[ArrivalsDeparturesRow]:
    _check_range(start, end)
    arrivals: dict[date, int] = dict(
        session.execute(
            select(Reservation.arrival, func.count())
            .where(
                Reservation.arrival >= start,
                Reservation.arrival < end,
                Reservation.status != ReservationStatus.cancelled,
            )
            .group_by(Reservation.arrival)
        ).tuples().all()
    )
    departures: dict[date, int] = dict(
        session.execute(
            select(Reservation.departure, func.count())
            .where(
                Reservation.departure >= start,
                Reservation.departure < end,
                Reservation.status != ReservationStatus.cancelled,
            )
            .group_by(Reservation.departure)
        ).tuples().all()
    )
    return [
        ArrivalsDeparturesRow(
            date=day, arrivals=arrivals.get(day, 0), departures=departures.get(day, 0)
        )
        for day in nights(start, end)
    ]
