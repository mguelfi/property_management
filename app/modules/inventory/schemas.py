from __future__ import annotations

from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .models import BlockReason


class PropertyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    legal_name: str
    address_line1: str
    address_line2: str
    city: str
    region: str
    postcode: str
    country: str
    timezone: str
    currency: str
    phone: str
    email: str
    check_in_time: time
    check_out_time: time


class PropertyUpdate(BaseModel):
    name: str | None = None
    legal_name: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    region: str | None = None
    postcode: str | None = None
    country: str | None = Field(default=None, min_length=2, max_length=2)
    timezone: str | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    phone: str | None = None
    email: str | None = None
    check_in_time: time | None = None
    check_out_time: time | None = None


class RoomTypeIn(BaseModel):
    code: str = Field(pattern=r"^[A-Z0-9_]{2,20}$")
    name: str
    description: str = ""
    max_occupancy: int = Field(ge=1, default=2)
    max_adults: int = Field(ge=1, default=2)
    standard_occupancy: int = Field(ge=1, default=2)
    bed_configuration: str = ""
    size_sqm: int | None = None
    sort_order: int = 100
    is_active: bool = True
    overbooking_allowance: int = Field(ge=0, default=0)


class RoomTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    max_occupancy: int | None = Field(default=None, ge=1)
    max_adults: int | None = Field(default=None, ge=1)
    standard_occupancy: int | None = Field(default=None, ge=1)
    bed_configuration: str | None = None
    size_sqm: int | None = None
    sort_order: int | None = None
    is_active: bool | None = None
    overbooking_allowance: int | None = Field(default=None, ge=0)


class RoomTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    description: str
    max_occupancy: int
    max_adults: int
    standard_occupancy: int
    bed_configuration: str
    size_sqm: int | None
    sort_order: int
    is_active: bool
    overbooking_allowance: int


class RoomIn(BaseModel):
    number: str = Field(max_length=20)
    name: str = ""
    floor: str = ""
    room_type_id: int
    is_active: bool = True
    notes: str = ""


class RoomUpdate(BaseModel):
    number: str | None = None
    name: str | None = None
    floor: str | None = None
    room_type_id: int | None = None
    is_active: bool | None = None
    notes: str | None = None
    adjoining_room_id: int | None = None


class RoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    number: str
    name: str
    floor: str
    room_type_id: int
    is_active: bool
    notes: str
    adjoining_room_id: int | None = None
    adjoining_room_number: str | None = None


class RoomBlockIn(BaseModel):
    room_id: int | None = None
    room_type_id: int | None = None
    units: int = Field(default=1, ge=1)
    start_date: date
    end_date: date
    reason: BlockReason = BlockReason.out_of_order
    note: str = ""

    @model_validator(mode="after")
    def _check(self) -> RoomBlockIn:
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        if (self.room_id is None) == (self.room_type_id is None):
            raise ValueError("exactly one of room_id or room_type_id is required")
        return self


class RoomBlockUpdate(BaseModel):
    units: int | None = Field(default=None, ge=1)
    start_date: date | None = None
    end_date: date | None = None
    reason: BlockReason | None = None
    note: str | None = None


class RoomBlockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    room_id: int | None
    room_type_id: int | None
    units: int
    start_date: date
    end_date: date
    reason: BlockReason
    note: str
