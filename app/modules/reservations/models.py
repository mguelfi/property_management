from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, str_enum


class ReservationStatus(enum.StrEnum):
    inquiry = "inquiry"
    confirmed = "confirmed"
    in_house = "in_house"
    checked_out = "checked_out"
    cancelled = "cancelled"
    no_show = "no_show"


class ReservationSource(enum.StrEnum):
    direct = "direct"
    phone = "phone"
    walk_in = "walk_in"
    ota = "ota"
    travel_agent = "travel_agent"
    other = "other"


ACTIVE_STATUSES = frozenset(
    {ReservationStatus.confirmed, ReservationStatus.in_house}
)
"""Statuses that hold inventory."""


class Reservation(Base, TimestampMixin):
    __tablename__ = "res_reservations"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    status: Mapped[ReservationStatus] = mapped_column(
        str_enum(ReservationStatus), default=ReservationStatus.confirmed, index=True
    )
    source: Mapped[ReservationSource] = mapped_column(
        str_enum(ReservationSource), default=ReservationSource.direct
    )
    channel_name: Mapped[str] = mapped_column(String(60), default="")
    external_reference: Mapped[str] = mapped_column(String(80), default="", index=True)

    primary_guest_id: Mapped[int] = mapped_column(ForeignKey("guests.id"), index=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("guest_companies.id"))

    currency: Mapped[str] = mapped_column(String(3))
    arrival: Mapped[date] = mapped_column(Date, index=True)
    departure: Mapped[date] = mapped_column(Date, index=True)
    total_minor: Mapped[int] = mapped_column(Integer, default=0)

    cancellation_note: Mapped[str] = mapped_column(Text, default="")
    free_cancel_until: Mapped[date | None] = mapped_column(Date)
    cancellation_penalty_nights: Mapped[int] = mapped_column(Integer, default=0)

    notes: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[int | None] = mapped_column(Integer)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str] = mapped_column(Text, default="")
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    rooms: Mapped[list[ReservationRoom]] = relationship(
        back_populates="reservation", cascade="all, delete-orphan", order_by="ReservationRoom.id"
    )


class ReservationRoom(Base):
    __tablename__ = "res_reservation_rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    reservation_id: Mapped[int] = mapped_column(
        ForeignKey("res_reservations.id", ondelete="CASCADE"), index=True
    )
    room_type_id: Mapped[int] = mapped_column(ForeignKey("inv_room_types.id"), index=True)
    rate_plan_id: Mapped[int] = mapped_column(ForeignKey("rate_plans.id"))
    assigned_room_id: Mapped[int | None] = mapped_column(
        ForeignKey("inv_rooms.id"), index=True
    )
    arrival: Mapped[date] = mapped_column(Date, index=True)
    departure: Mapped[date] = mapped_column(Date, index=True)
    adults: Mapped[int] = mapped_column(Integer, default=2)
    children: Mapped[int] = mapped_column(Integer, default=0)
    guest_name: Mapped[str] = mapped_column(String(200), default="")
    rate_total_minor: Mapped[int] = mapped_column(Integer, default=0)

    reservation: Mapped[Reservation] = relationship(back_populates="rooms")
    nightly_rates: Mapped[list[ReservationRoomNight]] = relationship(
        back_populates="reservation_room",
        cascade="all, delete-orphan",
        order_by="ReservationRoomNight.date",
    )


class ReservationRoomNight(Base):
    __tablename__ = "res_reservation_room_nights"

    id: Mapped[int] = mapped_column(primary_key=True)
    reservation_room_id: Mapped[int] = mapped_column(
        ForeignKey("res_reservation_rooms.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    amount_minor: Mapped[int] = mapped_column(Integer)
    posted: Mapped[bool] = mapped_column(default=False)
    """True once the nightly room charge for this night has been pushed to the folio."""

    reservation_room: Mapped[ReservationRoom] = relationship(back_populates="nightly_rates")
