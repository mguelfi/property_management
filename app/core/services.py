"""Core-defined service interfaces + their data-transfer types.

These let one module call another without importing its package. The owning
module registers a concrete implementation via
``app.core.service_registry.register_service``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Protocol, runtime_checkable

from sqlalchemy.orm import Session

from app.core.enums import ChargeCategory, PaymentMethod

# --------------------------------------------------------------------------- #
# Availability / rates
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class NightRate:
    date: date
    amount_minor: int


@dataclass(frozen=True)
class RateQuote:
    room_type_id: int
    rate_plan_id: int
    currency: str
    arrival: date
    departure: date
    nights: tuple[NightRate, ...]
    total_minor: int


@dataclass(frozen=True)
class RatePlanOffer:
    rate_plan_id: int
    rate_plan_code: str
    rate_plan_name: str
    currency: str
    total_minor: int
    restrictions: tuple[str, ...] = ()


@dataclass(frozen=True)
class RoomTypeOffer:
    room_type_id: int
    room_type_code: str
    room_type_name: str
    max_occupancy: int
    units_available: int
    rate_plans: tuple[RatePlanOffer, ...]

    @property
    def cheapest(self) -> RatePlanOffer | None:
        sellable = [rp for rp in self.rate_plans if not rp.restrictions]
        return min(sellable, key=lambda rp: rp.total_minor, default=None)


@runtime_checkable
class AvailabilityService(Protocol):
    def search(
        self,
        session: Session,
        *,
        arrival: date,
        departure: date,
        adults: int,
        children: int = 0,
        room_type_id: int | None = None,
    ) -> list[RoomTypeOffer]: ...

    def quote(
        self,
        session: Session,
        *,
        room_type_id: int,
        rate_plan_id: int,
        arrival: date,
        departure: date,
    ) -> RateQuote: ...

    def reserve(
        self,
        session: Session,
        *,
        room_type_id: int,
        arrival: date,
        departure: date,
        units: int = 1,
    ) -> None:
        """Atomically consume inventory for the range or raise
        :class:`app.core.errors.NoAvailability`. Caller must hold a transaction."""

    def release(
        self,
        session: Session,
        *,
        room_type_id: int,
        arrival: date,
        departure: date,
        units: int = 1,
    ) -> None: ...


@runtime_checkable
class RatesService(Protocol):
    def nightly_amount(
        self, session: Session, *, rate_plan_id: int, room_type_id: int, day: date
    ) -> int | None:
        """Resolved nightly price in minor units for a room type under a rate
        plan on a given date, or ``None`` if unpriced (following derived-plan
        chains as configured)."""


# --------------------------------------------------------------------------- #
# Billing / folio
# --------------------------------------------------------------------------- #


@runtime_checkable
class FolioService(Protocol):
    def get_or_open_folio(self, session: Session, *, reservation_id: int) -> int:
        """Return the primary folio id for a reservation, creating it if needed."""

    def post_charge(
        self,
        session: Session,
        *,
        folio_id: int,
        category: ChargeCategory,
        description: str,
        amount_minor: int,
        quantity: int = 1,
        actor_id: int | None = None,
        source: str = "manual",
        reference: str | None = None,
    ) -> int: ...

    def post_payment(
        self,
        session: Session,
        *,
        folio_id: int,
        method: PaymentMethod,
        amount_minor: int,
        actor_id: int | None = None,
        reference: str | None = None,
        received_at: datetime | None = None,
    ) -> int: ...

    def balance_minor(self, session: Session, *, folio_id: int) -> int:
        """Positive = guest owes the property."""

    def close_folio(self, session: Session, *, folio_id: int) -> None: ...
