from __future__ import annotations

from app.core.module import Module
from app.modules.frontdesk.events import GuestCheckedOut

from .permissions import PERMISSIONS
from .router import router
from .service import on_guest_checked_out

module = Module(
    name="housekeeping",
    router=router,
    tags=("housekeeping",),
    dependencies=("auth", "inventory", "frontdesk"),
    permissions=PERMISSIONS,
    event_handlers=((GuestCheckedOut, on_guest_checked_out),),
)
