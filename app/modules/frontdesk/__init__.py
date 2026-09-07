from __future__ import annotations

from app.core.module import Module
from app.core.undo import register_reverser

from .events import GuestCheckedIn, GuestCheckedOut, RoomAssigned, RoomUpgraded
from .permissions import PERMISSIONS
from .reversers import (
    revert_guest_checked_in,
    revert_guest_checked_out,
    revert_room_assigned,
    revert_room_upgraded,
)
from .router import router


def _startup() -> None:
    register_reverser(RoomAssigned, revert_room_assigned)
    register_reverser(RoomUpgraded, revert_room_upgraded)
    register_reverser(GuestCheckedIn, revert_guest_checked_in)
    register_reverser(GuestCheckedOut, revert_guest_checked_out)


module = Module(
    name="frontdesk",
    router=router,
    tags=("frontdesk",),
    dependencies=("auth", "reservations", "inventory", "billing"),
    permissions=PERMISSIONS,
    on_startup=_startup,
)
