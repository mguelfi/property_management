"""ASGI entrypoint: ``uvicorn app.main:app``."""

from __future__ import annotations

import logging

from app.core.config import get_settings
from app.core.registry import build_app

logging.basicConfig(level=logging.INFO)

settings = get_settings()
app = build_app(settings)
