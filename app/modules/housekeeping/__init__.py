from __future__ import annotations

from app.core.module import Module
from app.core.undo import register_reverser
from app.modules.frontdesk.events import GuestCheckedOut

from .permissions import PERMISSIONS
from .router import router
from .service import on_guest_checked_out, revert_guest_checked_out_housekeeping


def _startup() -> None:
    register_reverser(GuestCheckedOut, revert_guest_checked_out_housekeeping)


module = Module(
    name="housekeeping",
    router=router,
    tags=("housekeeping",),
    dependencies=("auth", "inventory", "frontdesk"),
    permissions=PERMISSIONS,
    event_handlers=((GuestCheckedOut, on_guest_checked_out),),
    on_startup=_startup,
)
