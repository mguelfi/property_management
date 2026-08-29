from __future__ import annotations

from dataclasses import dataclass

from app.core.events import Event


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
