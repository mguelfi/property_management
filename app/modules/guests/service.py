from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.errors import NotFound

from .models import Company, Guest


def get_guest(session: Session, guest_id: int) -> Guest:
    guest = session.get(Guest, guest_id)
    if guest is None:
        raise NotFound("Guest not found")
    return guest


def find_duplicates(session: Session, *, email: str | None, phone: str | None) -> list[Guest]:
    if not email and not phone:
        return []
    conditions = []
    if email:
        conditions.append(Guest.email == email)
    if phone:
        conditions.append(Guest.phone == phone)
    return list(session.scalars(select(Guest).where(or_(*conditions))))


def create_guest(session: Session, data: dict[str, Any]) -> Guest:
    company_id = data.get("company_id")
    if company_id is not None and session.get(Company, int(company_id)) is None:  # type: ignore[arg-type]
        raise NotFound("Company not found")
    guest = Guest(**data)
    session.add(guest)
    session.flush()
    return guest


def update_guest(session: Session, guest_id: int, changes: dict[str, Any]) -> Guest:
    guest = get_guest(session, guest_id)
    for key, value in changes.items():
        setattr(guest, key, value)
    session.flush()
    return guest


def get_company(session: Session, company_id: int) -> Company:
    company = session.get(Company, company_id)
    if company is None:
        raise NotFound("Company not found")
    return company


def create_company(session: Session, data: dict[str, Any]) -> Company:
    company = Company(**data)
    session.add(company)
    session.flush()
    return company
