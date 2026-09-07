from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import undo
from app.core.db import get_db
from app.core.pagination import Page, PageParams, page_params, paginate
from app.core.rbac import require
from app.core.security import CurrentUserDep
from app.modules.auth.models import User

from . import service
from .models import AuditEvent

router = APIRouter()
DbDep = Annotated[Session, Depends(get_db)]
view = require("audit.view")


class AuditEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    event_type: str
    actor_id: int | None
    actor_username: str | None = None
    entity_type: str
    entity_id: int | None
    occurred_at: object
    payload: dict
    undoable: bool = False


class UndoOut(BaseModel):
    id: int
    undone_at: datetime
    undone_by_actor_id: int


@router.get("/events", response_model=Page[AuditEventOut], dependencies=[view])
def list_events(
    db: DbDep,
    user: CurrentUserDep,
    params: Annotated[PageParams, Depends(page_params)],
    entity_type: Annotated[str | None, Query()] = None,
    entity_id: Annotated[int | None, Query()] = None,
    event_type: Annotated[str | None, Query()] = None,
) -> Page[AuditEventOut]:
    stmt = select(AuditEvent).order_by(AuditEvent.id.desc())
    if entity_type:
        stmt = stmt.where(AuditEvent.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(AuditEvent.entity_id == entity_id)
    if event_type:
        stmt = stmt.where(AuditEvent.event_type == event_type)
    rows, total = paginate(db, stmt, params)

    actor_ids = {r.actor_id for r in rows if r.actor_id is not None}
    usernames: dict[int, str] = {}
    if actor_ids:
        usernames = dict(
            db.execute(
                select(User.id, User.username).where(User.id.in_(actor_ids))
            )
            .tuples()
            .all()
        )

    items: list[AuditEventOut] = []
    for r in rows:
        out = AuditEventOut.model_validate(r)
        out.actor_username = usernames.get(r.actor_id) if r.actor_id is not None else None
        out.undoable = (
            r.undone_at is None
            and r.actor_id == user.id
            and undo.event_class_for(r.event_type) is not None
        )
        items.append(out)
    return Page[AuditEventOut](
        items=items, total=total, limit=params.limit, offset=params.offset
    )


@router.post("/events/{event_id}/undo", response_model=UndoOut)
def undo_event(event_id: int, db: DbDep, user: CurrentUserDep) -> UndoOut:
    row = service.undo_event(db, audit_event_id=event_id, actor_id=user.id)
    return UndoOut(
        id=row.id,
        undone_at=row.undone_at,
        undone_by_actor_id=row.undone_by_actor_id,
    )
