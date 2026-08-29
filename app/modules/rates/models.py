from __future__ import annotations

import enum
from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, str_enum


class MealPlan(enum.StrEnum):
    room_only = "room_only"
    breakfast = "breakfast"
    half_board = "half_board"
    full_board = "full_board"


class DerivedMode(enum.StrEnum):
    percent = "percent"
    amount = "amount"


class RatePlan(Base, TimestampMixin):
    __tablename__ = "rate_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    currency: Mapped[str] = mapped_column(String(3), default="AUD")
    meal_plan: Mapped[MealPlan] = mapped_column(
        str_enum(MealPlan), default=MealPlan.room_only
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Derived pricing (offset from another plan's rates).
    parent_rate_plan_id: Mapped[int | None] = mapped_column(ForeignKey("rate_plans.id"))
    derived_mode: Mapped[DerivedMode | None] = mapped_column(str_enum(DerivedMode))
    derived_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))

    # Cancellation policy (snapshotted onto reservations at booking time).
    free_cancel_until_days: Mapped[int] = mapped_column(Integer, default=1)
    cancellation_penalty_nights: Mapped[int] = mapped_column(Integer, default=1)
    cancellation_note: Mapped[str] = mapped_column(Text, default="")

    parent: Mapped[RatePlan | None] = relationship(remote_side=[id])
    room_type_links: Mapped[list[RatePlanRoomType]] = relationship(
        back_populates="rate_plan", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def is_derived(self) -> bool:
        return self.parent_rate_plan_id is not None

    @property
    def room_type_ids(self) -> set[int]:
        return {link.room_type_id for link in self.room_type_links}


class RatePlanRoomType(Base):
    __tablename__ = "rate_plan_room_types"

    rate_plan_id: Mapped[int] = mapped_column(
        ForeignKey("rate_plans.id", ondelete="CASCADE"), primary_key=True
    )
    room_type_id: Mapped[int] = mapped_column(
        ForeignKey("inv_room_types.id", ondelete="CASCADE"), primary_key=True
    )

    rate_plan: Mapped[RatePlan] = relationship(back_populates="room_type_links")


class RateCalendar(Base):
    __tablename__ = "rate_calendar"
    __table_args__ = (
        UniqueConstraint("rate_plan_id", "room_type_id", "date", name="uq_rate_ppd"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    rate_plan_id: Mapped[int] = mapped_column(
        ForeignKey("rate_plans.id", ondelete="CASCADE"), index=True
    )
    room_type_id: Mapped[int] = mapped_column(
        ForeignKey("inv_room_types.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    amount_minor: Mapped[int] = mapped_column(Integer)


class RateRestriction(Base):
    __tablename__ = "rate_restrictions"
    __table_args__ = (
        UniqueConstraint("rate_plan_id", "room_type_id", "date", name="uq_restriction_ppd"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    rate_plan_id: Mapped[int] = mapped_column(
        ForeignKey("rate_plans.id", ondelete="CASCADE"), index=True
    )
    room_type_id: Mapped[int] = mapped_column(
        ForeignKey("inv_room_types.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    min_stay: Mapped[int] = mapped_column(Integer, default=1)
    max_stay: Mapped[int | None] = mapped_column(Integer)
    closed: Mapped[bool] = mapped_column(Boolean, default=False)
    closed_to_arrival: Mapped[bool] = mapped_column(Boolean, default=False)
    closed_to_departure: Mapped[bool] = mapped_column(Boolean, default=False)
