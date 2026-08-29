from datetime import date

from app.core.daterange import night_count, nights, overlaps
from app.core.money import Money


def test_nights_half_open():
    assert list(nights(date(2026, 1, 1), date(2026, 1, 4))) == [
        date(2026, 1, 1),
        date(2026, 1, 2),
        date(2026, 1, 3),
    ]
    assert night_count(date(2026, 1, 1), date(2026, 1, 4)) == 3
    assert list(nights(date(2026, 1, 4), date(2026, 1, 4))) == []


def test_overlap():
    assert overlaps(date(2026, 1, 1), date(2026, 1, 5), date(2026, 1, 4), date(2026, 1, 9))
    assert not overlaps(
        date(2026, 1, 1), date(2026, 1, 4), date(2026, 1, 4), date(2026, 1, 9)
    )


def test_money_percentage_and_rounding():
    assert Money.from_decimal("100.00", "AUD").amount_minor == 10000
    assert Money(10000, "AUD").percentage("10") == Money(1000, "AUD")
    assert Money(9999, "AUD").percentage("10").amount_minor == 1000  # 999.9 -> 1000
    assert Money.from_decimal("100", "JPY").amount_minor == 100
