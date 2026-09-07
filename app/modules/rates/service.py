from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.daterange import nights
from app.core.errors import NotFound, ValidationProblem

from .models import (
    DerivedMode,
    RateCalendar,
    RatePlan,
    RatePlanRoomType,
    RateRestriction,
)

_MAX_DERIVE_DEPTH = 5


def get_rate_plan(session: Session, rate_plan_id: int) -> RatePlan:
    plan = session.get(RatePlan, rate_plan_id)
    if plan is None:
        raise NotFound("Rate plan not found")
    return plan


def list_rate_plans(session: Session, *, active_only: bool = False) -> list[RatePlan]:
    stmt = select(RatePlan).order_by(RatePlan.code)
    if active_only:
        stmt = stmt.where(RatePlan.is_active.is_(True))
    return list(session.scalars(stmt))


def _set_room_types(session: Session, plan: RatePlan, room_type_ids: list[int]) -> None:
    session.execute(
        delete(RatePlanRoomType).where(RatePlanRoomType.rate_plan_id == plan.id)
    )
    session.flush()
    for rt_id in dict.fromkeys(room_type_ids):
        session.add(RatePlanRoomType(rate_plan_id=plan.id, room_type_id=rt_id))
    session.flush()


def create_rate_plan(session: Session, data: dict[str, Any]) -> RatePlan:
    if session.scalar(select(RatePlan).where(RatePlan.code == data["code"])):
        raise ValidationProblem("Rate plan code already exists")
    room_type_ids = list(data.pop("room_type_ids", []) or [])  # type: ignore[arg-type]
    if data.get("parent_rate_plan_id") is not None:
        get_rate_plan(session, int(data["parent_rate_plan_id"]))
    plan = RatePlan(**data)
    session.add(plan)
    session.flush()
    _set_room_types(session, plan, room_type_ids)
    return plan


def update_rate_plan(session: Session, rate_plan_id: int, changes: dict[str, Any]) -> RatePlan:
    plan = get_rate_plan(session, rate_plan_id)
    room_type_ids = changes.pop("room_type_ids", None)
    if changes.get("parent_rate_plan_id") is not None:
        if int(changes["parent_rate_plan_id"]) == plan.id:
            raise ValidationProblem("A rate plan cannot derive from itself")
        get_rate_plan(session, int(changes["parent_rate_plan_id"]))
    for key, value in changes.items():
        setattr(plan, key, value)
    if room_type_ids is not None:
        _set_room_types(session, plan, list(room_type_ids))  # type: ignore[arg-type]
    session.flush()
    return plan


def set_rates(
    session: Session,
    *,
    rate_plan_id: int,
    room_type_id: int,
    start_date: date,
    end_date: date,
    amount_minor: int,
) -> int:
    plan = get_rate_plan(session, rate_plan_id)
    if plan.is_derived:
        raise ValidationProblem("Cannot set explicit rates on a derived plan")
    if room_type_id not in plan.room_type_ids:
        raise ValidationProblem("Room type is not attached to this rate plan")
    existing = {
        row.date: row
        for row in session.scalars(
            select(RateCalendar).where(
                RateCalendar.rate_plan_id == rate_plan_id,
                RateCalendar.room_type_id == room_type_id,
                RateCalendar.date >= start_date,
                RateCalendar.date < end_date,
            )
        )
    }
    count = 0
    for day in nights(start_date, end_date):
        if day in existing:
            existing[day].amount_minor = amount_minor
        else:
            session.add(
                RateCalendar(
                    rate_plan_id=rate_plan_id,
                    room_type_id=room_type_id,
                    date=day,
                    amount_minor=amount_minor,
                )
            )
        count += 1
    session.flush()
    return count


def set_restrictions(session: Session, *, rate_plan_id: int, room_type_id: int,
                     start_date: date, end_date: date, **fields: Any) -> int:
    get_rate_plan(session, rate_plan_id)
    fields = {k: v for k, v in fields.items() if v is not None}
    existing = {
        row.date: row
        for row in session.scalars(
            select(RateRestriction).where(
                RateRestriction.rate_plan_id == rate_plan_id,
                RateRestriction.room_type_id == room_type_id,
                RateRestriction.date >= start_date,
                RateRestriction.date < end_date,
            )
        )
    }
    count = 0
    for day in nights(start_date, end_date):
        row = existing.get(day)
        if row is None:
            row = RateRestriction(
                rate_plan_id=rate_plan_id, room_type_id=room_type_id, date=day
            )
            session.add(row)
        for key, value in fields.items():
            setattr(row, key, value)
        count += 1
    session.flush()
    return count


def nightly_amount(
    session: Session, rate_plan: RatePlan, room_type_id: int, day: date, _depth: int = 0
) -> int | None:
    """Resolved nightly price in minor units, or ``None`` if unpriced."""
    if not rate_plan.is_derived:
        row = session.scalar(
            select(RateCalendar).where(
                RateCalendar.rate_plan_id == rate_plan.id,
                RateCalendar.room_type_id == room_type_id,
                RateCalendar.date == day,
            )
        )
        return row.amount_minor if row else None

    if _depth >= _MAX_DERIVE_DEPTH:
        raise ValidationProblem("Rate plan derivation chain too deep")
    parent = session.get(RatePlan, rate_plan.parent_rate_plan_id)
    if parent is None:
        return None
    base = nightly_amount(session, parent, room_type_id, day, _depth + 1)
    if base is None:
        return None
    if rate_plan.derived_mode == DerivedMode.amount:
        return max(int(base) + int(rate_plan.derived_value or 0), 0)
    factor = (Decimal(100) + Decimal(rate_plan.derived_value or 0)) / Decimal(100)
    return max(int((Decimal(base) * factor).quantize(Decimal(1), rounding=ROUND_HALF_UP)), 0)


def restriction_for(
    session: Session, rate_plan_id: int, room_type_id: int, day: date
) -> RateRestriction | None:
    return session.scalar(
        select(RateRestriction).where(
            RateRestriction.rate_plan_id == rate_plan_id,
            RateRestriction.room_type_id == room_type_id,
            RateRestriction.date == day,
        )
    )


class RatesServiceImpl:
    """Implements :class:`app.core.services.RatesService` for the registry, so
    other modules (e.g. frontdesk, pricing a room-type upgrade) can resolve a
    nightly rate without importing this package directly."""

    def nightly_amount(
        self, session: Session, *, rate_plan_id: int, room_type_id: int, day: date
    ) -> int | None:
        plan = session.get(RatePlan, rate_plan_id)
        if plan is None:
            return None
        return nightly_amount(session, plan, room_type_id, day)


service_impl = RatesServiceImpl()
