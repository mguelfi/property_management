"""Payment gateway abstraction.

The first build records payments only (cash, terminal, bank transfer, etc.).
A real processor (Stripe, Adyen, ...) is added later by implementing
:class:`PaymentGateway` and registering it in ``__init__._startup``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ChargeResult:
    reference: str
    captured: bool


class PaymentGateway(Protocol):
    name: str

    def charge(self, *, amount_minor: int, currency: str, reference: str | None) -> ChargeResult:
        ...

    def refund(self, *, amount_minor: int, currency: str, reference: str) -> ChargeResult:
        ...


class ManualGateway:
    """No-op gateway: the money moved outside the system; we just record it."""

    name = "manual"

    def charge(
        self, *, amount_minor: int, currency: str, reference: str | None
    ) -> ChargeResult:
        return ChargeResult(reference=reference or "", captured=True)

    def refund(self, *, amount_minor: int, currency: str, reference: str) -> ChargeResult:
        return ChargeResult(reference=reference, captured=True)
