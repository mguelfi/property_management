from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .models import ReservationSource, ReservationStatus


class RoomLineIn(BaseModel):
    room_type_id: int
    rate_plan_id: int
    arrival: date
    departure: date
    adults: int = Field(default=2, ge=1)
    children: int = Field(default=0, ge=0)
    guest_name: str = ""

    @model_validator(mode="after")
    def _range(self) -> RoomLineIn:
        if self.departure <= self.arrival:
            raise ValueError("departure must be after arrival")
        return self


class ReservationCreate(BaseModel):
    primary_guest_id: int
    company_id: int | None = None
    source: ReservationSource = ReservationSource.direct
    channel_name: str = ""
    external_reference: str = ""
    status: ReservationStatus = ReservationStatus.confirmed
    notes: str = ""
    rooms: list[RoomLineIn] = Field(min_length=1)


class RoomLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    room_type_id: int
    rate_plan_id: int
    assigned_room_id: int | None
    arrival: date
    departure: date
    adults: int
    children: int
    guest_name: str
    rate_total_minor: int


class ReservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reference: str
    status: ReservationStatus
    source: ReservationSource
    channel_name: str
    external_reference: str
    primary_guest_id: int
    company_id: int | None
    currency: str
    arrival: date
    departure: date
    total_minor: int
    cancellation_note: str
    free_cancel_until: date | None
    notes: str
    checked_in_at: datetime | None
    checked_out_at: datetime | None
    cancelled_at: datetime | None
    rooms: list[RoomLineOut]


class ReservationListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reference: str
    status: ReservationStatus
    primary_guest_id: int
    arrival: date
    departure: date
    total_minor: int
    currency: str


class CancelIn(BaseModel):
    reason: str = ""


class ModifyRoomsIn(BaseModel):
    rooms: list[RoomLineIn] = Field(min_length=1)
