from __future__ import annotations

from app.core.module import Module
from app.core.service_registry import register_service
from app.core.services import FolioService

from .permissions import PERMISSIONS
from .router import router
from .service import service_impl


def _startup() -> None:
    register_service(FolioService, service_impl)


module = Module(
    name="billing",
    router=router,
    tags=("billing",),
    dependencies=("auth", "reservations"),
    permissions=PERMISSIONS,
    on_startup=_startup,
)
