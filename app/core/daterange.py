"""Half-open stay intervals: ``[arrival, departure)``.

Night ``d`` is occupied when ``arrival <= d < departure``. A one-night stay
arriving Monday departs Tuesday and occupies the single night ``Monday``.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date, timedelta


def nights(arrival: date, departure: date) -> Iterator[date]:
    if departure <= arrival:
        return
    current = arrival
    while current < departure:
        yield current
        current += timedelta(days=1)


def night_count(arrival: date, departure: date) -> int:
    return max((departure - arrival).days, 0)


def overlaps(a_start: date, a_end: date, b_start: date, b_end: date) -> bool:
    """True if two half-open intervals share at least one night."""
    return a_start < b_end and b_start < a_end
