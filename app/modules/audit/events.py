from __future__ import annotations

from dataclasses import dataclass

from app.core.events import Event


@dataclass(kw_only=True)
class ActionUndone(Event):
    """Published once, by the undo endpoint itself, after every successful
    undo — regardless of whether the reverser reused a forward service
    function (which re-publishes its own event) or mutated ORM state
    directly (which doesn't). Guarantees every undo shows up in the audit
    trail exactly once, uniformly."""

    original_event_id: int
    original_event_type: str
    entity_type: str
    entity_id: int | None
