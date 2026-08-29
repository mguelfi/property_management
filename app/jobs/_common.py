from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.core.registry import import_model_metadata, load_modules

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("pms.jobs")


def bootstrap() -> None:
    """Import all module models and run their startup hooks (service registry,
    event subscriptions) so jobs behave like the running app."""
    import_model_metadata()
    from app.core.events import bus

    bus.clear()
    for mod in load_modules():
        for event_type, handler in mod.event_handlers:
            bus.subscribe(event_type, handler)
        if mod.on_startup is not None:
            mod.on_startup()


@contextmanager
def session_scope() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
