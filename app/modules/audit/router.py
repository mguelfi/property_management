from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.pagination import Page, PageParams, page_params, paginate
from app.core.rbac import require
from app.modules.auth.models import User

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


@router.get("/events", response_model=Page[AuditEventOut], dependencies=[view])
def list_events(
    db: DbDep,
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
        usernames = {
            uid: uname
            for uid, uname in db.execute(
                select(User.id, User.username).where(User.id.in_(actor_ids))
            ).all()
        }

    items: list[AuditEventOut] = []
    for r in rows:
        out = AuditEventOut.model_validate(r)
        out.actor_username = usernames.get(r.actor_id) if r.actor_id is not None else None
        items.append(out)
    return Page[AuditEventOut](
        items=items, total=total, limit=params.limit, offset=params.offset
    )
