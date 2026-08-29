"""Serve the built React SPA (``app/modules/webui/dist/``) from the FastAPI app.

No-op until ``npm run build`` has produced ``dist/index.html`` — during
development the Vite dev server serves the UI and proxies ``/api`` to the
backend, so nothing here runs.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

DIST = Path(__file__).parent / "dist"

# Paths owned by the backend; the SPA catch-all must never answer these.
_RESERVED_PREFIXES = ("api/", "api", "docs", "redoc", "openapi.json", "health")


def mount_spa(app: FastAPI) -> None:
    index = DIST / "index.html"
    if not index.is_file():
        return

    assets = DIST / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="spa-assets")

    @app.get("/", include_in_schema=False)
    def _spa_root() -> FileResponse:
        return FileResponse(index)

    @app.get("/{path:path}", include_in_schema=False)
    def _spa_catch_all(path: str) -> FileResponse:
        if path.startswith(_RESERVED_PREFIXES):
            raise HTTPException(status_code=404, detail="Not found")
        dist = DIST.resolve()
        candidate = (dist / path).resolve()
        if candidate.is_file() and dist in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index)  # SPA client-side route
