from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.pagination import Page, PageParams, page_params, paginate
from app.core.rbac import require

from .models import AuditEvent

router = APIRouter()
DbDep = Annotated[Session, Depends(get_db)]
view = require("audit.view")


class AuditEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    event_type: str
    actor_id: int | None
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
    return Page[AuditEventOut](
        items=[AuditEventOut.model_validate(r) for r in rows],
        total=total,
        limit=params.limit,
        offset=params.offset,
    )
