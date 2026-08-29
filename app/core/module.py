"""The module contract.

Each feature package under ``app/modules/<name>/`` exposes a module-level
``module = Module(...)`` in its ``__init__.py``. The registry discovers these,
orders them by dependency, mounts routers, and wires event handlers.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from fastapi import APIRouter

from app.core.events import Event, Handler


@dataclass(frozen=True, kw_only=True)
class Module:
    name: str
    """Unique short name. Router mounts at ``/api/<name>`` unless overridden."""

    router: APIRouter | None = None
    prefix: str | None = None
    tags: tuple[str, ...] = ()

    dependencies: tuple[str, ...] = ()
    """Names of other modules this one may import from and relies on at runtime."""

    event_handlers: tuple[tuple[type[Event], Handler], ...] = ()

    permissions: tuple[tuple[str, str], ...] = ()
    """``(code, description)`` pairs this module defines. Collected by the seed
    job / an admin sync into the ``permissions`` table."""

    on_startup: Callable[[], None] | None = None
    """Called once during app startup, after all modules are imported. Use this
    to register service implementations (see ``app.core.service_registry``)."""

    models_module: str | None = field(default=None)
    """Dotted path to the module's ``models`` submodule, imported eagerly so
    Alembic autogenerate and ``Base.metadata`` see every table. Defaults to
    ``app.modules.<name>.models`` when the module defines any models."""

    def resolved_prefix(self) -> str:
        return self.prefix if self.prefix is not None else f"/api/{self.name}"
