from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rbac import require

from . import service
from .schemas import ArrivalsDeparturesRow, OccupancySummary, RevenueSummary

router = APIRouter()
DbDep = Annotated[Session, Depends(get_db)]
view = require("reports.view")
DateQ = Annotated[date, Query()]


@router.get("/occupancy", response_model=list[OccupancySummary], dependencies=[view])
def occupancy(db: DbDep, start: DateQ, end: DateQ) -> list[OccupancySummary]:
    return service.occupancy_by_day(db, start, end)


@router.get("/revenue", response_model=RevenueSummary, dependencies=[view])
def revenue(db: DbDep, start: DateQ, end: DateQ) -> RevenueSummary:
    return service.revenue_summary(db, start, end)


@router.get(
    "/arrivals-departures", response_model=list[ArrivalsDeparturesRow], dependencies=[view]
)
def arrivals_departures(db: DbDep, start: DateQ, end: DateQ) -> list[ArrivalsDeparturesRow]:
    return service.arrivals_departures(db, start, end)
