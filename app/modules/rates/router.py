from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rbac import require

from . import service
from .models import RateCalendar, RatePlan, RateRestriction
from .schemas import (
    RateBulkSet,
    RateCalendarRow,
    RatePlanIn,
    RatePlanOut,
    RatePlanUpdate,
    RateRestrictionRow,
    RestrictionBulkSet,
)

router = APIRouter()
DbDep = Annotated[Session, Depends(get_db)]
view = require("rates.view")
manage = require("rates.manage")


@router.get("/plans", response_model=list[RatePlanOut], dependencies=[view])
def list_plans(db: DbDep, active_only: Annotated[bool, Query()] = False) -> list[RatePlan]:
    return service.list_rate_plans(db, active_only=active_only)


@router.post("/plans", response_model=RatePlanOut, status_code=201, dependencies=[manage])
def create_plan(payload: RatePlanIn, db: DbDep) -> RatePlan:
    return service.create_rate_plan(db, payload.model_dump())


@router.get("/plans/{plan_id}", response_model=RatePlanOut, dependencies=[view])
def get_plan(plan_id: int, db: DbDep) -> RatePlan:
    return service.get_rate_plan(db, plan_id)


@router.patch("/plans/{plan_id}", response_model=RatePlanOut, dependencies=[manage])
def update_plan(plan_id: int, payload: RatePlanUpdate, db: DbDep) -> RatePlan:
    return service.update_rate_plan(db, plan_id, payload.model_dump(exclude_unset=True))


@router.put("/calendar", dependencies=[manage])
def set_rates(payload: RateBulkSet, db: DbDep) -> dict[str, int]:
    n = service.set_rates(
        db,
        rate_plan_id=payload.rate_plan_id,
        room_type_id=payload.room_type_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        amount_minor=payload.amount_minor,
    )
    return {"updated": n}


@router.get("/calendar", response_model=list[RateCalendarRow], dependencies=[view])
def get_calendar(
    db: DbDep,
    rate_plan_id: Annotated[int, Query()],
    start_date: Annotated[date, Query()],
    end_date: Annotated[date, Query()],
    room_type_id: Annotated[int | None, Query()] = None,
) -> list[RateCalendar]:
    stmt = select(RateCalendar).where(
        RateCalendar.rate_plan_id == rate_plan_id,
        RateCalendar.date >= start_date,
        RateCalendar.date < end_date,
    )
    if room_type_id is not None:
        stmt = stmt.where(RateCalendar.room_type_id == room_type_id)
    return list(db.scalars(stmt.order_by(RateCalendar.date, RateCalendar.room_type_id)))


@router.get("/restrictions", response_model=list[RateRestrictionRow], dependencies=[view])
def get_restrictions(
    db: DbDep,
    rate_plan_id: Annotated[int, Query()],
    start_date: Annotated[date, Query()],
    end_date: Annotated[date, Query()],
    room_type_id: Annotated[int | None, Query()] = None,
) -> list[RateRestriction]:
    stmt = select(RateRestriction).where(
        RateRestriction.rate_plan_id == rate_plan_id,
        RateRestriction.date >= start_date,
        RateRestriction.date < end_date,
    )
    if room_type_id is not None:
        stmt = stmt.where(RateRestriction.room_type_id == room_type_id)
    return list(db.scalars(stmt.order_by(RateRestriction.date, RateRestriction.room_type_id)))


@router.put("/restrictions", dependencies=[manage])
def set_restrictions(payload: RestrictionBulkSet, db: DbDep) -> dict[str, int]:
    n = service.set_restrictions(
        db,
        rate_plan_id=payload.rate_plan_id,
        room_type_id=payload.room_type_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        min_stay=payload.min_stay,
        max_stay=payload.max_stay,
        closed=payload.closed,
        closed_to_arrival=payload.closed_to_arrival,
        closed_to_departure=payload.closed_to_departure,
    )
    return {"updated": n}
