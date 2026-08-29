"""Money as integer minor units + ISO currency code.

Storage is always ``amount_minor: int`` (e.g. cents). Arithmetic that needs
fractions (tax, percentage discounts) goes through :class:`Money`, which works
in :class:`~decimal.Decimal` and rounds half-up to the minor unit.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

# Currencies whose minor unit is not 1/100.
_EXPONENTS = {"JPY": 0, "KRW": 0, "CLP": 0, "BHD": 3, "KWD": 3, "OMR": 3}


def minor_unit_exponent(currency: str) -> int:
    return _EXPONENTS.get(currency.upper(), 2)


@dataclass(frozen=True, order=True)
class Money:
    amount_minor: int
    currency: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "currency", self.currency.upper())

    @classmethod
    def zero(cls, currency: str) -> Money:
        return cls(0, currency)

    @classmethod
    def from_decimal(cls, value: Decimal | str | int, currency: str) -> Money:
        exp = minor_unit_exponent(currency)
        quantum = Decimal(1).scaleb(-exp)
        minor = (Decimal(value) / quantum).quantize(Decimal(1), rounding=ROUND_HALF_UP)
        return cls(int(minor), currency)

    def _check(self, other: Money) -> None:
        if self.currency != other.currency:
            raise ValueError(f"currency mismatch: {self.currency} vs {other.currency}")

    def __add__(self, other: Money) -> Money:
        self._check(other)
        return Money(self.amount_minor + other.amount_minor, self.currency)

    def __sub__(self, other: Money) -> Money:
        self._check(other)
        return Money(self.amount_minor - other.amount_minor, self.currency)

    def __neg__(self) -> Money:
        return Money(-self.amount_minor, self.currency)

    def percentage(self, rate: Decimal | str) -> Money:
        exp = minor_unit_exponent(self.currency)
        raw = Decimal(self.amount_minor) * Decimal(rate) / Decimal(100)
        # round in whole minor units
        _ = exp
        return Money(int(raw.quantize(Decimal(1), rounding=ROUND_HALF_UP)), self.currency)

    @property
    def as_decimal(self) -> Decimal:
        exp = minor_unit_exponent(self.currency)
        return Decimal(self.amount_minor).scaleb(-exp)

    def __str__(self) -> str:
        return f"{self.as_decimal} {self.currency}"
