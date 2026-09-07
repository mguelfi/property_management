"""Registry of "how to reverse event type X" — mirrors ``service_registry``'s
style. A module registers a reverser during its own ``on_startup``, and the
generic undo endpoint (``app.modules.audit``) looks one up by the recorded
event's type name, reconstructs the event from its stored JSON payload, and
runs the reverser(s) inside the request's transaction.
"""

from __future__ import annotations

import dataclasses
from collections.abc import Callable
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.core.events import Event

Reverser = Callable[[Event, Session], None]

_reversers: dict[type[Event], list[Reverser]] = {}
_event_types_by_name: dict[str, type[Event]] = {}


def register_reverser(event_type: type[Event], reverser: Reverser) -> None:
    _reversers.setdefault(event_type, []).append(reverser)
    _event_types_by_name[event_type.__name__] = event_type


def get_reversers(event_type: type[Event]) -> list[Reverser]:
    return list(_reversers.get(event_type, ()))


def event_class_for(event_type_name: str) -> type[Event] | None:
    return _event_types_by_name.get(event_type_name)


def clear_reversers() -> None:
    _reversers.clear()
    _event_types_by_name.clear()


def deserialize_event(event_cls: type[Event], payload: dict) -> Event:
    """Reconstruct a typed event from the JSON ``payload`` that
    ``app.modules.audit.service.record_event`` stores. Dates/datetimes come
    back as ISO strings and tuples come back as lists — both are restored to
    their declared type; everything else passes through unchanged (including
    ``undo_context``, whose own dict keys may need further, field-specific
    handling by whatever reverser reads them, since JSON coerces all object
    keys to strings).

    Every module here uses ``from __future__ import annotations``, so
    ``dataclasses.fields(...)[i].type`` is the annotation's *source text*
    (e.g. ``"datetime"``, ``"tuple[int, ...]"``), not a real type object —
    the checks below match on that text.
    """
    kwargs: dict[str, object] = {}
    for f in dataclasses.fields(event_cls):
        if f.name not in payload:
            continue
        value = payload[f.name]
        type_str = f.type if isinstance(f.type, str) else ""
        if value is not None:
            if "datetime" in type_str:
                value = datetime.fromisoformat(value)
            elif "date" in type_str:
                value = date.fromisoformat(value)
            elif type_str.startswith("tuple"):
                value = tuple(value)
        kwargs[f.name] = value
    return event_cls(**kwargs)
