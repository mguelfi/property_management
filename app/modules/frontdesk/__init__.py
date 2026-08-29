from __future__ import annotations

from app.core.module import Module

from .permissions import PERMISSIONS
from .router import router

module = Module(
    name="frontdesk",
    router=router,
    tags=("frontdesk",),
    dependencies=("auth", "reservations", "inventory", "billing"),
    permissions=PERMISSIONS,
)
