"""``python -m app`` — run the API server on the configured host/port.

Port/host come from ``PMS_PORT`` / ``PMS_HOST`` (default 0.0.0.0:8010).
For autoreload during development use uvicorn directly:
``uvicorn app.main:app --reload --port 8010``.
"""

from __future__ import annotations

import uvicorn

from app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, log_level="info")


if __name__ == "__main__":
    main()
