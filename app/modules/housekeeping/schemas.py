from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from .models import HousekeepingTaskStatus, RoomHousekeepingStatus


class RoomStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    room_id: int
    room_number: str
    floor: str
    room_type_id: int
    status: RoomHousekeepingStatus
    updated_at: datetime | None
    updated_by: int | None
    note: str


class SetStatusIn(BaseModel):
    status: RoomHousekeepingStatus
    note: str = ""


class TaskIn(BaseModel):
    room_id: int
    assigned_to: int | None = None
    description: str = ""


class TaskUpdateIn(BaseModel):
    status: HousekeepingTaskStatus | None = None
    assigned_to: int | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    room_id: int
    assigned_to: int | None
    status: HousekeepingTaskStatus
    description: str
    created_by: int | None
    completed_at: datetime | None
