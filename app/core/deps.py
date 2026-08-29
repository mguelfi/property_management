"""FastAPI dependencies for cross-module services and the event bus."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.events import EventBus, bus
from app.core.service_registry import get_service
from app.core.services import AvailabilityService, FolioService


def get_bus() -> EventBus:
    return bus


def get_availability_service() -> AvailabilityService:
    return get_service(AvailabilityService)


def get_folio_service() -> FolioService:
    return get_service(FolioService)


BusDep = Annotated[EventBus, Depends(get_bus)]
AvailabilityDep = Annotated[AvailabilityService, Depends(get_availability_service)]
FolioDep = Annotated[FolioService, Depends(get_folio_service)]
