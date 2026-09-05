from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rbac import require
from app.core.security import CurrentUserDep

from . import service
from .models import HousekeepingTaskStatus, RoomHousekeepingStatus
from .schemas import RoomStatusOut, SetStatusIn, TaskIn, TaskOut, TaskUpdateIn

router = APIRouter()
DbDep = Annotated[Session, Depends(get_db)]
view = require("housekeeping.view")
manage = require("housekeeping.manage")


@router.get("/board", response_model=list[RoomStatusOut], dependencies=[view])
def board(
    db: DbDep,
    floor: Annotated[str | None, Query()] = None,
    status: Annotated[RoomHousekeepingStatus | None, Query()] = None,
) -> list[RoomStatusOut]:
    return service.list_board(db, floor=floor, status=status)


@router.post("/rooms/{room_id}/status", response_model=RoomStatusOut, dependencies=[manage])
def set_room_status(
    room_id: int, payload: SetStatusIn, db: DbDep, user: CurrentUserDep
) -> RoomStatusOut:
    service.set_status(
        db, room_id=room_id, status=payload.status, actor_id=user.id, note=payload.note
    )
    return next(row for row in service.list_board(db) if row.room_id == room_id)


@router.get("/tasks", response_model=list[TaskOut], dependencies=[view])
def list_tasks(
    db: DbDep, status: Annotated[HousekeepingTaskStatus | None, Query()] = None
) -> list[TaskOut]:
    return [TaskOut.model_validate(t) for t in service.list_tasks(db, status=status)]


@router.post("/tasks", response_model=TaskOut, status_code=201, dependencies=[manage])
def create_task(payload: TaskIn, db: DbDep, user: CurrentUserDep) -> TaskOut:
    return TaskOut.model_validate(
        service.create_task(db, payload.model_dump(), actor_id=user.id)
    )


@router.patch("/tasks/{task_id}", response_model=TaskOut, dependencies=[manage])
def update_task(task_id: int, payload: TaskUpdateIn, db: DbDep) -> TaskOut:
    return TaskOut.model_validate(
        service.update_task(db, task_id, payload.model_dump(exclude_unset=True))
    )
