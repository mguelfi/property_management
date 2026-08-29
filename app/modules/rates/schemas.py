from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .models import DerivedMode, MealPlan


class RatePlanIn(BaseModel):
    code: str = Field(pattern=r"^[A-Za-z0-9_-]{2,30}$")
    name: str
    description: str = ""
    currency: str = Field(min_length=3, max_length=3, default="AUD")
    meal_plan: MealPlan = MealPlan.room_only
    is_active: bool = True
    room_type_ids: list[int] = []
    parent_rate_plan_id: int | None = None
    derived_mode: DerivedMode | None = None
    derived_value: Decimal | None = None
    free_cancel_until_days: int = Field(ge=0, default=1)
    cancellation_penalty_nights: int = Field(ge=0, default=1)
    cancellation_note: str = ""

    @model_validator(mode="after")
    def _check_derived(self) -> RatePlanIn:
        if self.parent_rate_plan_id is not None and (
            self.derived_mode is None or self.derived_value is None
        ):
            raise ValueError("derived_mode and derived_value are required for a derived plan")
        return self


class RatePlanUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    meal_plan: MealPlan | None = None
    is_active: bool | None = None
    room_type_ids: list[int] | None = None
    parent_rate_plan_id: int | None = None
    derived_mode: DerivedMode | None = None
    derived_value: Decimal | None = None
    free_cancel_until_days: int | None = Field(default=None, ge=0)
    cancellation_penalty_nights: int | None = Field(default=None, ge=0)
    cancellation_note: str | None = None


class RatePlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    description: str
    currency: str
    meal_plan: MealPlan
    is_active: bool
    is_derived: bool
    parent_rate_plan_id: int | None
    derived_mode: DerivedMode | None
    derived_value: Decimal | None
    free_cancel_until_days: int
    cancellation_penalty_nights: int
    cancellation_note: str
    room_type_ids: set[int]


class RateBulkSet(BaseModel):
    rate_plan_id: int
    room_type_id: int
    start_date: date
    end_date: date
    amount_minor: int = Field(ge=0)

    @model_validator(mode="after")
    def _range(self) -> RateBulkSet:
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class RestrictionBulkSet(BaseModel):
    rate_plan_id: int
    room_type_id: int
    start_date: date
    end_date: date
    min_stay: int | None = Field(default=None, ge=1)
    max_stay: int | None = Field(default=None, ge=1)
    closed: bool | None = None
    closed_to_arrival: bool | None = None
    closed_to_departure: bool | None = None

    @model_validator(mode="after")
    def _range(self) -> RestrictionBulkSet:
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class RateCalendarRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    date: date
    room_type_id: int
    rate_plan_id: int
    amount_minor: int
