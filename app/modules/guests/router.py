from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.pagination import Page, PageParams, page_params, paginate
from app.core.rbac import require

from . import service
from .models import Company, Guest
from .schemas import CompanyIn, CompanyOut, GuestIn, GuestOut, GuestUpdate

router = APIRouter()
DbDep = Annotated[Session, Depends(get_db)]
view = require("guests.view")
manage = require("guests.manage")


@router.get("", response_model=Page[GuestOut], dependencies=[view])
def list_guests(
    db: DbDep,
    params: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query()] = None,
) -> Page[GuestOut]:
    stmt = select(Guest).order_by(Guest.last_name, Guest.first_name)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Guest.last_name.ilike(like),
                Guest.first_name.ilike(like),
                Guest.email.ilike(like),
                Guest.phone.ilike(like),
            )
        )
    rows, total = paginate(db, stmt, params)
    return Page[GuestOut](
        items=[GuestOut.model_validate(r) for r in rows],
        total=total,
        limit=params.limit,
        offset=params.offset,
    )


@router.post("", response_model=GuestOut, status_code=201, dependencies=[manage])
def create_guest(payload: GuestIn, db: DbDep) -> Guest:
    return service.create_guest(db, payload.model_dump())


@router.get("/{guest_id}", response_model=GuestOut, dependencies=[view])
def get_guest(guest_id: int, db: DbDep) -> Guest:
    return service.get_guest(db, guest_id)


@router.patch("/{guest_id}", response_model=GuestOut, dependencies=[manage])
def update_guest(guest_id: int, payload: GuestUpdate, db: DbDep) -> Guest:
    return service.update_guest(db, guest_id, payload.model_dump(exclude_unset=True))


@router.get("/{guest_id}/duplicates", response_model=list[GuestOut], dependencies=[view])
def duplicates(guest_id: int, db: DbDep) -> list[Guest]:
    guest = service.get_guest(db, guest_id)
    return [
        g
        for g in service.find_duplicates(db, email=guest.email, phone=guest.phone)
        if g.id != guest.id
    ]


@router.get("/companies/", response_model=list[CompanyOut], dependencies=[view])
def list_companies(db: DbDep) -> list[Company]:
    return list(db.scalars(select(Company).order_by(Company.name)))


@router.post("/companies/", response_model=CompanyOut, status_code=201, dependencies=[manage])
def create_company(payload: CompanyIn, db: DbDep) -> Company:
    return service.create_company(db, payload.model_dump())
