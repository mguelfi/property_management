from __future__ import annotations

from app.core.module import Module

from .permissions import PERMISSIONS
from .router import router

module = Module(
    name="reservations",
    router=router,
    tags=("reservations",),
    dependencies=("auth", "inventory", "rates", "guests", "availability"),
    permissions=PERMISSIONS,
)
