"""Serves the staff web UI (a React SPA).

The frontend project lives in the repo-root ``frontend/`` directory and builds
to ``app/modules/webui/dist/``. This module only wires that static bundle into
the app; it has no models, router, or permissions of its own.
"""

from __future__ import annotations

from app.core.module import Module

from .spa import mount_spa

module = Module(
    name="webui",
    mount=mount_spa,
)
