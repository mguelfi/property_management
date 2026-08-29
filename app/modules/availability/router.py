from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import CurrentUserDep

from .schemas import (
    NightRateOut,
    RatePlanOfferOut,
    RateQuoteOut,
    RoomTypeOfferOut,
)
from .service import service_impl

router = APIRouter()
DbDep = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[RoomTypeOfferOut])
def search_availability(
    db: DbDep,
    _: CurrentUserDep,
    arrival: Annotated[date, Query()],
    departure: Annotated[date, Query()],
    adults: Annotated[int, Query(ge=1)] = 2,
    children: Annotated[int, Query(ge=0)] = 0,
    room_type_id: Annotated[int | None, Query()] = None,
) -> list[RoomTypeOfferOut]:
    offers = service_impl.search(
        db,
        arrival=arrival,
        departure=departure,
        adults=adults,
        children=children,
        room_type_id=room_type_id,
    )
    return [
        RoomTypeOfferOut(
            room_type_id=o.room_type_id,
            room_type_code=o.room_type_code,
            room_type_name=o.room_type_name,
            max_occupancy=o.max_occupancy,
            units_available=o.units_available,
            rate_plans=[
                RatePlanOfferOut(
                    rate_plan_id=rp.rate_plan_id,
                    rate_plan_code=rp.rate_plan_code,
                    rate_plan_name=rp.rate_plan_name,
                    currency=rp.currency,
                    total_minor=rp.total_minor,
                    restrictions=list(rp.restrictions),
                    sellable=not rp.restrictions and o.units_available > 0,
                )
                for rp in o.rate_plans
            ],
        )
        for o in offers
    ]


@router.get("/quote", response_model=RateQuoteOut)
def quote(
    db: DbDep,
    _: CurrentUserDep,
    room_type_id: Annotated[int, Query()],
    rate_plan_id: Annotated[int, Query()],
    arrival: Annotated[date, Query()],
    departure: Annotated[date, Query()],
) -> RateQuoteOut:
    q = service_impl.quote(
        db,
        room_type_id=room_type_id,
        rate_plan_id=rate_plan_id,
        arrival=arrival,
        departure=departure,
    )
    return RateQuoteOut(
        room_type_id=q.room_type_id,
        rate_plan_id=q.rate_plan_id,
        currency=q.currency,
        arrival=q.arrival,
        departure=q.departure,
        nights=[NightRateOut(date=n.date, amount_minor=n.amount_minor) for n in q.nights],
        total_minor=q.total_minor,
    )
