"""Module discovery, dependency ordering, and app assembly."""

from __future__ import annotations

import contextlib
import importlib
import logging
from graphlib import CycleError, TopologicalSorter

from fastapi import FastAPI

from app.core.config import Settings, get_settings
from app.core.events import bus
from app.core.module import Module

logger = logging.getLogger("pms.registry")


class ModuleConfigError(RuntimeError):
    pass


def _import_module(name: str) -> Module:
    try:
        pkg = importlib.import_module(f"app.modules.{name}")
    except ModuleNotFoundError as exc:
        raise ModuleConfigError(f"Enabled module '{name}' not found") from exc
    mod = getattr(pkg, "module", None)
    if not isinstance(mod, Module):
        raise ModuleConfigError(f"app.modules.{name} does not expose a `module = Module(...)`")
    if mod.name != name:
        raise ModuleConfigError(f"Module in package '{name}' declares name '{mod.name}'")
    return mod


def load_modules(settings: Settings | None = None) -> list[Module]:
    """Return enabled modules in dependency order (dependencies first)."""
    settings = settings or get_settings()
    modules = {name: _import_module(name) for name in settings.enabled_modules}

    sorter: TopologicalSorter[str] = TopologicalSorter()
    for name, mod in modules.items():
        for dep in mod.dependencies:
            if dep not in modules:
                raise ModuleConfigError(
                    f"Module '{name}' depends on '{dep}', which is not enabled"
                )
        sorter.add(name, *mod.dependencies)
    try:
        order = list(sorter.static_order())
    except CycleError as exc:
        raise ModuleConfigError(f"Circular module dependency: {exc.args[1]}") from exc

    return [modules[name] for name in order]


def import_model_metadata(settings: Settings | None = None) -> None:
    """Import every enabled module's ``models`` submodule so ``Base.metadata``
    is complete (used by Alembic and by ``create_all`` in tests)."""
    for mod in load_modules(settings):
        target = mod.models_module or f"app.modules.{mod.name}.models"
        try:
            importlib.import_module(target)
        except ModuleNotFoundError:
            logger.debug("module %s has no models", mod.name)


def build_app(settings: Settings | None = None) -> FastAPI:
    from app.core.db import DBSessionMiddleware
    from app.core.errors import install_exception_handlers

    settings = settings or get_settings()
    modules = load_modules(settings)

    app = FastAPI(title="Property Management System", debug=settings.debug)
    app.add_middleware(DBSessionMiddleware)
    install_exception_handlers(app)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, object]:
        return {"status": "ok", "modules": [m.name for m in modules]}

    bus.clear()
    for mod in modules:
        target = mod.models_module or f"app.modules.{mod.name}.models"
        with contextlib.suppress(ModuleNotFoundError):
            importlib.import_module(target)

        if mod.router is not None:
            app.include_router(
                mod.router,
                prefix=mod.resolved_prefix(),
                tags=list(mod.tags) or [mod.name],
            )
        for event_type, handler in mod.event_handlers:
            bus.subscribe(event_type, handler)
        if mod.on_startup is not None:
            mod.on_startup()
        logger.info("loaded module: %s", mod.name)

    # Second pass: raw-app mounts (static files, catch-alls) run last so they
    # cannot shadow an earlier module's routes.
    for mod in modules:
        if mod.mount is not None:
            mod.mount(app)

    return app
