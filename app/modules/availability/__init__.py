from __future__ import annotations

from app.core.module import Module
from app.core.service_registry import register_service
from app.core.services import AvailabilityService

from .router import router
from .service import service_impl


def _startup() -> None:
    register_service(AvailabilityService, service_impl)


module = Module(
    name="availability",
    router=router,
    tags=("availability",),
    dependencies=("auth", "inventory", "rates"),
    on_startup=_startup,
)
