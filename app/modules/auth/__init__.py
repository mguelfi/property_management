from __future__ import annotations

from app.core.module import Module
from app.core.security import set_user_resolver

from .permissions import PERMISSIONS
from .router import router
from .service import resolve_user


def _startup() -> None:
    set_user_resolver(resolve_user)


module = Module(
    name="auth",
    router=router,
    tags=("auth",),
    permissions=PERMISSIONS,
    on_startup=_startup,
)
