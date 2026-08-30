from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin, str_enum
from app.core.enums import FolioLineKind


class FolioStatus(enum.StrEnum):
    open = "open"
    closed = "closed"


class Folio(Base, TimestampMixin):
    __tablename__ = "bill_folios"

    id: Mapped[int] = mapped_column(primary_key=True)
    reservation_id: Mapped[int] = mapped_column(
        ForeignKey("res_reservations.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    status: Mapped[FolioStatus] = mapped_column(
        str_enum(FolioStatus), default=FolioStatus.open
    )
    currency: Mapped[str] = mapped_column(String(3))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    lines: Mapped[list[FolioLine]] = relationship(
        back_populates="folio", cascade="all, delete-orphan", order_by="FolioLine.id"
    )


class FolioLine(Base):
    __tablename__ = "bill_folio_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    folio_id: Mapped[int] = mapped_column(
        ForeignKey("bill_folios.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[FolioLineKind] = mapped_column(str_enum(FolioLineKind))
    category: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(String(255))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_amount_minor: Mapped[int] = mapped_column(Integer)
    amount_minor: Mapped[int] = mapped_column(Integer)
    """Signed. Positive = increases what the guest owes (charge/tax);
    negative = payment / credit."""
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    posted_by: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(30), default="manual")
    reference: Mapped[str] = mapped_column(String(120), default="")
    parent_line_id: Mapped[int | None] = mapped_column(ForeignKey("bill_folio_lines.id"))
    tax_component_minor: Mapped[int] = mapped_column(Integer, default=0)
    """GST/tax already embedded in ``amount_minor`` for tax-inclusive rules.
    Informational only — it does not affect the folio balance."""
    is_void: Mapped[bool] = mapped_column(Boolean, default=False)
    void_reason: Mapped[str] = mapped_column(Text, default="")

    folio: Mapped[Folio] = relationship(back_populates="lines")
    payment: Mapped[Payment | None] = relationship(
        back_populates="line", uselist=False, cascade="all, delete-orphan"
    )


class Payment(Base):
    __tablename__ = "bill_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    folio_line_id: Mapped[int] = mapped_column(
        ForeignKey("bill_folio_lines.id", ondelete="CASCADE"), unique=True
    )
    method: Mapped[str] = mapped_column(String(30))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reference: Mapped[str] = mapped_column(String(120), default="")

    line: Mapped[FolioLine] = relationship(back_populates="payment")


class TaxRule(Base, TimestampMixin):
    __tablename__ = "bill_tax_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    percent: Mapped[float | None] = mapped_column(Numeric(6, 3))
    fixed_minor: Mapped[int | None] = mapped_column(Integer)
    applies_to_categories: Mapped[list[str]] = mapped_column(JSONB, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=100)
    tax_inclusive: Mapped[bool] = mapped_column(Boolean, default=False)
    """When true, charge prices already include this tax; the tax portion is
    recorded on the charge line and not added as a separate balance line."""


class Invoice(Base, TimestampMixin):
    __tablename__ = "bill_invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    folio_id: Mapped[int] = mapped_column(ForeignKey("bill_folios.id"), index=True)
    number: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    bill_to_name: Mapped[str] = mapped_column(String(200), default="")
    bill_to_address: Mapped[str] = mapped_column(Text, default="")
    currency: Mapped[str] = mapped_column(String(3))
    total_minor: Mapped[int] = mapped_column(Integer)
    lines_json: Mapped[list[dict]] = mapped_column(JSONB, default=list)
