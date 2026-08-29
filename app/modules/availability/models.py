from __future__ import annotations

from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class InventoryLedger(Base):
    """One row per (room type, night) tracking units sold.

    Reservations increment ``sold_units`` under ``SELECT ... FOR UPDATE``; this
    row is the concurrency choke point that prevents oversell.
    """

    __tablename__ = "avail_inventory_ledger"
    __table_args__ = (
        UniqueConstraint("room_type_id", "date", name="uq_ledger_room_type_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    room_type_id: Mapped[int] = mapped_column(
        ForeignKey("inv_room_types.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    sold_units: Mapped[int] = mapped_column(Integer, default=0)
