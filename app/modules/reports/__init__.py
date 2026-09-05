from __future__ import annotations

from app.core.module import Module

from .permissions import PERMISSIONS
from .router import router

module = Module(
    name="reports",
    router=router,
    tags=("reports",),
    dependencies=("auth", "inventory", "reservations"),
    permissions=PERMISSIONS,
)
