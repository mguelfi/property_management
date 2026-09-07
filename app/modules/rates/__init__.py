from __future__ import annotations

from app.core.module import Module
from app.core.service_registry import register_service
from app.core.services import RatesService

from .permissions import PERMISSIONS
from .router import router
from .service import service_impl


def _startup() -> None:
    register_service(RatesService, service_impl)


module = Module(
    name="rates",
    router=router,
    tags=("rates",),
    dependencies=("auth", "inventory"),
    permissions=PERMISSIONS,
    on_startup=_startup,
)
