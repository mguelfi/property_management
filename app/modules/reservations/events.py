from __future__ import annotations

from dataclasses import dataclass

from app.core.events import Event


@dataclass(kw_only=True)
class ReservationConfirmed(Event):
    reservation_id: int
    reference: str


@dataclass(kw_only=True)
class ReservationCancelled(Event):
    reservation_id: int
    reference: str
    reason: str


@dataclass(kw_only=True)
class ReservationNoShow(Event):
    reservation_id: int
    reference: str


@dataclass(kw_only=True)
class ReservationModified(Event):
    reservation_id: int
    reference: str
