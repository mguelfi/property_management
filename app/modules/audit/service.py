from __future__ import annotations

import dataclasses
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.core import undo
from app.core.errors import AlreadyUndone, NotFound, NotUndoable, PermissionDenied
from app.core.events import Event, bus
from app.modules.audit.events import ActionUndone

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
    row = AuditEvent(
        event_type=type(event).__name__,
        actor_id=event.actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        occurred_at=event.occurred_at,
        payload={k: _jsonable(v) for k, v in data.items()},
    )
    session.add(row)
    session.flush()
    event.undo_context["audit_event_id"] = row.id


def undo_event(session: Session, *, audit_event_id: int, actor_id: int) -> AuditEvent:
    row = session.get(AuditEvent, audit_event_id)
    if row is None:
        raise NotFound("Audit event not found")
    if row.actor_id != actor_id:
        raise PermissionDenied("Only the original actor can undo this action")
    if row.undone_at is not None:
        raise AlreadyUndone("This action has already been undone")
    event_cls = undo.event_class_for(row.event_type)
    reversers = undo.get_reversers(event_cls) if event_cls is not None else []
    if not reversers:
        raise NotUndoable("This action cannot be undone")
    event = undo.deserialize_event(event_cls, row.payload)
    for reverser in reversers:
        reverser(event, session)
    row.undone_at = datetime.now(UTC)
    row.undone_by_actor_id = actor_id
    session.flush()
    bus.publish(
        ActionUndone(
            original_event_id=row.id,
            original_event_type=row.event_type,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            actor_id=actor_id,
        ),
        session,
    )
    return row
