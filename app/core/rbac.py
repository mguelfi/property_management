"""Permission-guard dependency factory.

Usage in a router::

    from app.core.rbac import require

    @router.post("/rooms", dependencies=[require("inventory.manage")])
    def create_room(...): ...

Or to also use the user object::

    @router.post("/rooms")
    def create_room(user: CurrentUserDep, ...):
        user.require("inventory.manage")
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from fastapi.params import Depends as DependsType

from app.core.security import CurrentUser, get_current_user


def require(*codes: str) -> DependsType:
    """Return a FastAPI dependency that 403s unless the caller has every code."""

    def _guard(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        user.require(*codes)
        return user

    return Depends(_guard)
