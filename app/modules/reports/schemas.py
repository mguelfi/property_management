from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class OccupancySummary(BaseModel):
    date: date
    rooms_total: int
    rooms_occupied: int
    occupancy_pct: float


class RevenueSummary(BaseModel):
    start: date
    end: date
    room_revenue_minor: int
    room_nights_sold: int
    adr_minor: int
    revpar_minor: int
    currency: str


class ArrivalsDeparturesRow(BaseModel):
    date: date
    arrivals: int
    departures: int
