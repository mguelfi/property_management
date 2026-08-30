from __future__ import annotations

import enum
from datetime import date, time

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, str_enum


class Property(Base, TimestampMixin):
    __tablename__ = "inv_property"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    legal_name: Mapped[str] = mapped_column(String(200), default="")
    address_line1: Mapped[str] = mapped_column(String(200), default="")
    address_line2: Mapped[str] = mapped_column(String(200), default="")
    city: Mapped[str] = mapped_column(String(100), default="")
    region: Mapped[str] = mapped_column(String(100), default="")
    postcode: Mapped[str] = mapped_column(String(20), default="")
    country: Mapped[str] = mapped_column(String(2), default="AU")
    timezone: Mapped[str] = mapped_column(String(64), default="Australia/Brisbane")
    currency: Mapped[str] = mapped_column(String(3), default="AUD")
    phone: Mapped[str] = mapped_column(String(40), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    check_in_time: Mapped[time] = mapped_column(Time, default=time(15, 0))
    check_out_time: Mapped[time] = mapped_column(Time, default=time(10, 0))


class RoomType(Base, TimestampMixin):
    __tablename__ = "inv_room_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    max_occupancy: Mapped[int] = mapped_column(Integer, default=2)
    max_adults: Mapped[int] = mapped_column(Integer, default=2)
    standard_occupancy: Mapped[int] = mapped_column(Integer, default=2)
    bed_configuration: Mapped[str] = mapped_column(String(120), default="")
    size_sqm: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    overbooking_allowance: Mapped[int] = mapped_column(Integer, default=0)

    rooms: Mapped[list[Room]] = relationship(back_populates="room_type")


class Room(Base, TimestampMixin):
    __tablename__ = "inv_rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80), default="")
    floor: Mapped[str] = mapped_column(String(20), default="")
    room_type_id: Mapped[int] = mapped_column(ForeignKey("inv_room_types.id"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    adjoining_room_id: Mapped[int | None] = mapped_column(
        ForeignKey("inv_rooms.id"), index=True, nullable=True
    )

    room_type: Mapped[RoomType] = relationship(back_populates="rooms", lazy="joined")
    adjoining_room: Mapped[Room | None] = relationship(
        "Room", remote_side=[id], foreign_keys=[adjoining_room_id], lazy="joined"
    )


class BlockReason(enum.StrEnum):
    out_of_order = "out_of_order"
    maintenance = "maintenance"
    hold = "hold"
    other = "other"


class RoomBlock(Base, TimestampMixin):
    """Removes inventory from sale for a half-open date range.

    Either ``room_id`` (a specific room) OR ``room_type_id`` + ``units``
    (an unassigned allotment hold) must be set.
    """

    __tablename__ = "inv_room_blocks"
    __table_args__ = (UniqueConstraint("room_id", "start_date", name="uq_block_room_start"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int | None] = mapped_column(ForeignKey("inv_rooms.id"), index=True)
    room_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("inv_room_types.id"), index=True
    )
    units: Mapped[int] = mapped_column(Integer, default=1)
    start_date: Mapped[date] = mapped_column(Date, index=True)
    end_date: Mapped[date] = mapped_column(Date, index=True)
    reason: Mapped[BlockReason] = mapped_column(
        str_enum(BlockReason), default=BlockReason.out_of_order
    )
    note: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[int | None] = mapped_column(Integer)
