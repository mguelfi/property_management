from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.modules.reservations.schemas import ReservationCreate, ReservationOut


class AssignIn(BaseModel):
    room_id: int
    allow_type_mismatch: bool = False
    note: str = ""


class CheckOutIn(BaseModel):
    allow_balance: bool = False


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
