"""In-process synchronous event bus.

Modules publish domain events (defined next to the module that owns them) and
other modules subscribe. Handlers run inside the publisher's transaction and
receive the active :class:`~sqlalchemy.orm.Session`, so a subscriber's writes
commit or roll back atomically with the action that triggered them.

A failing handler is logged and swallowed — one bad subscriber must not abort
the business operation. Handlers that need hard guarantees should not use the
bus.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy.orm import Session

logger = logging.getLogger("pms.events")


@dataclass(kw_only=True)
class Event:
    """Base class for all domain events."""

    occurred_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    actor_id: int | None = None


Handler = Callable[[Event, Session], None]


class EventBus:
    def __init__(self) -> None:
        self._subscribers: dict[type[Event], list[Handler]] = {}

    def subscribe(self, event_type: type[Event], handler: Handler) -> None:
        self._subscribers.setdefault(event_type, []).append(handler)

    def clear(self) -> None:
        self._subscribers.clear()

    def publish(self, event: Event, session: Session) -> None:
        for event_type in type(event).__mro__:
            if not isinstance(event_type, type) or not issubclass(event_type, Event):
                continue
            for handler in self._subscribers.get(event_type, []):
                try:
                    handler(event, session)
                except Exception:  # noqa: BLE001 - deliberate isolation
                    logger.exception(
                        "event handler %s failed for %s",
                        getattr(handler, "__qualname__", handler),
                        type(event).__name__,
                    )


bus = EventBus()
