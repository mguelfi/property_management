from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class RatePlanOfferOut(BaseModel):
    rate_plan_id: int
    rate_plan_code: str
    rate_plan_name: str
    currency: str
    total_minor: int
    restrictions: list[str]
    sellable: bool


class RoomTypeOfferOut(BaseModel):
    room_type_id: int
    room_type_code: str
    room_type_name: str
    max_occupancy: int
    units_available: int
    rate_plans: list[RatePlanOfferOut]


class NightRateOut(BaseModel):
    date: date
    amount_minor: int


class RateQuoteOut(BaseModel):
    room_type_id: int
    rate_plan_id: int
    currency: str
    arrival: date
    departure: date
    nights: list[NightRateOut]
    total_minor: int
