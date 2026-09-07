from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

from app.modules.reservations.schemas import ReservationCreate, ReservationOut


class AssignIn(BaseModel):
    room_id: int
    allow_type_mismatch: bool = False
    note: str = ""


class CheckOutIn(BaseModel):
    allow_balance: bool = False


class UpgradeChargeIn(BaseModel):
    """A pending room-upgrade charge to post once check-in opens the folio.

    ``amount_minor`` is staff-controlled and posted verbatim — it is not
    re-derived from ``UpgradeQuoteOut`` server-side, which is only ever a
    suggestion. ``amount_minor=0`` records a free upgrade (audit event only,
    no folio line).
    """

    line_id: int
    amount_minor: int = Field(ge=0, default=0)
    description: str = ""
    from_view_id: int | None = None
    to_view_id: int | None = None


class CheckInIn(BaseModel):
    upgrades: list[UpgradeChargeIn] = []


class UpgradeQuoteOut(BaseModel):
    nights: int
    room_type_delta_minor: int
    view_surcharge_minor: int
    total_minor: int
    from_view_id: int | None
    to_view_id: int | None


class WalkInCreate(ReservationCreate):
    """Same shape as a reservation; it is checked in immediately and any
    unassigned rooms are auto-assigned."""


class ArrivalRow(BaseModel):
    id: int
    reference: str
    primary_guest_id: int
    arrival: date
    departure: date
    status: str
    unassigned_rooms: int


class FrontDeskAction(BaseModel):
    reservation: ReservationOut
    message: str = ""


class NightAuditIn(BaseModel):
    as_of: date | None = None


class NightAuditOut(BaseModel):
    as_of: date
    night: date
    charges_posted: int
    no_shows_marked: int
