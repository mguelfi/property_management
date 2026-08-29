from __future__ import annotations

import dataclasses
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.core.events import Event

from .models import AuditEvent

_ENTITY_KEYS = ("reservation_id", "folio_id", "guest_id", "room_id", "reservation_room_id")


def _jsonable(value: object) -> object:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_jsonable(v) for v in value]
    return value


def record_event(event: Event, session: Session) -> None:
    data = dataclasses.asdict(event)
    entity_type = ""
    entity_id: int | None = None
    for key in _ENTITY_KEYS:
        if key in data and data[key] is not None:
            entity_type = key.removesuffix("_id")
            entity_id = int(data[key])
            break
    session.add(
        AuditEvent(
            event_type=type(event).__name__,
            actor_id=event.actor_id,
            entity_type=entity_type,
            entity_id=entity_id,
            occurred_at=event.occurred_at,
            payload={k: _jsonable(v) for k, v in data.items()},
        )
    )
