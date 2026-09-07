from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.core.events import Event


@dataclass(kw_only=True)
class NightAuditRun(Event):
    as_of: date
    night: date
    charges_posted: int
    no_shows_marked: int


@dataclass(kw_only=True)
class GuestCheckedIn(Event):
    reservation_id: int
    reference: str
    room_ids: tuple[int, ...]


@dataclass(kw_only=True)
class GuestCheckedOut(Event):
    reservation_id: int
    reference: str
    room_ids: tuple[int, ...]


@dataclass(kw_only=True)
class RoomAssigned(Event):
    reservation_room_id: int
    room_id: int
    previous_room_id: int | None


@dataclass(kw_only=True)
class RoomUpgraded(Event):
    reservation_id: int
    line_id: int
    room_id: int
    from_view_id: int | None
    to_view_id: int | None
    charge_amount_minor: int
