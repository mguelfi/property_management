from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rbac import require
from app.core.security import CurrentUserDep

from . import service
from .models import Folio, TaxRule
from .schemas import (
    ChargeIn,
    FolioOut,
    InvoiceIn,
    InvoiceOut,
    PaymentIn,
    TaxRuleIn,
    TaxRuleOut,
    VoidIn,
)

router = APIRouter()
DbDep = Annotated[Session, Depends(get_db)]
view = require("billing.view")
post_charges = require("billing.post")
manage_tax = require("billing.manage_tax")
close = require("billing.close")


def _folio_out(db: Session, folio: Folio) -> FolioOut:
    out = FolioOut.model_validate(folio)
    out.balance_minor = service.service_impl.balance_minor(db, folio_id=folio.id)
    return out


@router.get("/folios/{folio_id}", response_model=FolioOut, dependencies=[view])
def get_folio(folio_id: int, db: DbDep) -> FolioOut:
    return _folio_out(db, service.get_folio(db, folio_id))


@router.get("/reservations/{reservation_id}/folio", response_model=FolioOut, dependencies=[view])
def folio_for_reservation(reservation_id: int, db: DbDep) -> FolioOut:
    folio_id = service.service_impl.get_or_open_folio(db, reservation_id=reservation_id)
    return _folio_out(db, service.get_folio(db, folio_id))


@router.post("/folios/{folio_id}/charges", response_model=FolioOut, dependencies=[post_charges])
def post_charge(folio_id: int, payload: ChargeIn, db: DbDep, user: CurrentUserDep) -> FolioOut:
    service.service_impl.post_charge(
        db,
        folio_id=folio_id,
        category=payload.category,
        description=payload.description,
        amount_minor=payload.amount_minor,
        quantity=payload.quantity,
        actor_id=user.id,
        reference=payload.reference,
    )
    return _folio_out(db, service.get_folio(db, folio_id))


@router.post("/folios/{folio_id}/payments", response_model=FolioOut, dependencies=[post_charges])
def post_payment(folio_id: int, payload: PaymentIn, db: DbDep, user: CurrentUserDep) -> FolioOut:
    service.service_impl.post_payment(
        db,
        folio_id=folio_id,
        method=payload.method,
        amount_minor=payload.amount_minor,
        actor_id=user.id,
        reference=payload.reference,
        received_at=payload.received_at,
    )
    return _folio_out(db, service.get_folio(db, folio_id))


@router.post("/lines/{line_id}/void", response_model=FolioOut, dependencies=[post_charges])
def void_line(line_id: int, payload: VoidIn, db: DbDep, user: CurrentUserDep) -> FolioOut:
    from .models import FolioLine

    line = db.get(FolioLine, line_id)
    if line is None:
        from app.core.errors import NotFound

        raise NotFound("Folio line not found")
    service.service_impl.void_line(db, line_id=line_id, reason=payload.reason, actor_id=user.id)
    return _folio_out(db, service.get_folio(db, line.folio_id))


@router.post("/folios/{folio_id}/close", response_model=FolioOut, dependencies=[close])
def close_folio(folio_id: int, db: DbDep) -> FolioOut:
    service.service_impl.close_folio(db, folio_id=folio_id)
    return _folio_out(db, service.get_folio(db, folio_id))


@router.post("/folios/{folio_id}/invoice", response_model=InvoiceOut, dependencies=[close])
def generate_invoice(folio_id: int, payload: InvoiceIn, db: DbDep) -> InvoiceOut:
    invoice = service.service_impl.generate_invoice(
        db,
        folio_id=folio_id,
        bill_to_name=payload.bill_to_name,
        bill_to_address=payload.bill_to_address,
    )
    return InvoiceOut.model_validate(invoice)


@router.get("/tax-rules", response_model=list[TaxRuleOut], dependencies=[view])
def list_tax_rules(db: DbDep) -> list[TaxRule]:
    return list(db.scalars(select(TaxRule).order_by(TaxRule.sort_order, TaxRule.id)))


@router.post("/tax-rules", response_model=TaxRuleOut, status_code=201, dependencies=[manage_tax])
def create_tax_rule(payload: TaxRuleIn, db: DbDep) -> TaxRule:
    rule = TaxRule(
        name=payload.name,
        percent=payload.percent,
        fixed_minor=payload.fixed_minor,
        applies_to_categories=[c.value for c in payload.applies_to_categories],
        is_active=payload.is_active,
        sort_order=payload.sort_order,
    )
    db.add(rule)
    db.flush()
    return rule
