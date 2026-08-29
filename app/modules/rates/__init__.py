from __future__ import annotations

from app.core.module import Module

from .permissions import PERMISSIONS
from .router import router

module = Module(
    name="rates",
    router=router,
    tags=("rates",),
    dependencies=("auth", "inventory"),
    permissions=PERMISSIONS,
)
