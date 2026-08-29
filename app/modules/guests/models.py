from __future__ import annotations

from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin


class Company(Base, TimestampMixin):
    __tablename__ = "guest_companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    is_travel_agent: Mapped[bool] = mapped_column(Boolean, default=False)
    commission_pct: Mapped[float | None] = mapped_column(Numeric(5, 2))
    tax_id: Mapped[str] = mapped_column(String(50), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    billing_address: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")


class Guest(Base, TimestampMixin):
    __tablename__ = "guests"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100), index=True)
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column(String(40), index=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    nationality: Mapped[str] = mapped_column(String(2), default="")
    address_line1: Mapped[str] = mapped_column(String(200), default="")
    address_line2: Mapped[str] = mapped_column(String(200), default="")
    city: Mapped[str] = mapped_column(String(100), default="")
    region: Mapped[str] = mapped_column(String(100), default="")
    postcode: Mapped[str] = mapped_column(String(20), default="")
    country: Mapped[str] = mapped_column(String(2), default="")
    id_document_type: Mapped[str] = mapped_column(String(30), default="")
    id_document_number: Mapped[str] = mapped_column(String(60), default="")
    company_id: Mapped[int | None] = mapped_column(ForeignKey("guest_companies.id"))
    marketing_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()
