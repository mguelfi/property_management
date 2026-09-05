from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, str_enum


class RoomHousekeepingStatus(enum.StrEnum):
    clean = "clean"
    dirty = "dirty"
    inspected = "inspected"
    out_of_service = "out_of_service"


class RoomHousekeepingState(Base, TimestampMixin):
    """One row per room. Created lazily (get-or-create) so newly added rooms
    default to ``clean`` without needing a backfill migration."""

    __tablename__ = "hk_room_state"

    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("inv_rooms.id"), unique=True, index=True)
    status: Mapped[RoomHousekeepingStatus] = mapped_column(
        str_enum(RoomHousekeepingStatus), default=RoomHousekeepingStatus.clean
    )
    updated_by: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(Text, default="")


class HousekeepingTaskStatus(enum.StrEnum):
    open = "open"
    in_progress = "in_progress"
    done = "done"


class HousekeepingTask(Base, TimestampMixin):
    __tablename__ = "hk_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("inv_rooms.id"), index=True)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("auth_users.id"), index=True)
    status: Mapped[HousekeepingTaskStatus] = mapped_column(
        str_enum(HousekeepingTaskStatus), default=HousekeepingTaskStatus.open
    )
    description: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[int | None] = mapped_column(Integer)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
