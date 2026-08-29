from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, str_enum


class AssignmentAction(enum.StrEnum):
    assigned = "assigned"
    moved = "moved"
    released = "released"


class RoomAssignmentLog(Base):
    __tablename__ = "fd_room_assignment_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    reservation_room_id: Mapped[int] = mapped_column(
        ForeignKey("res_reservation_rooms.id", ondelete="CASCADE"), index=True
    )
    room_id: Mapped[int | None] = mapped_column(ForeignKey("inv_rooms.id"))
    previous_room_id: Mapped[int | None] = mapped_column(ForeignKey("inv_rooms.id"))
    action: Mapped[AssignmentAction] = mapped_column(str_enum(AssignmentAction))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    by: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(Text, default="")
