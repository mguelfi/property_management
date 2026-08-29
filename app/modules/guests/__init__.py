from __future__ import annotations

from app.core.module import Module

from .permissions import PERMISSIONS
from .router import router

module = Module(
    name="guests",
    router=router,
    tags=("guests",),
    dependencies=("auth",),
    permissions=PERMISSIONS,
)
