from __future__ import annotations

from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import ChargeCategory, FolioLineKind, PaymentMethod
from app.core.errors import Conflict, NotFound, ValidationProblem

from .models import Folio, FolioLine, FolioStatus, Invoice, Payment, TaxRule


def _now() -> datetime:
    return datetime.now(UTC)


def get_folio(session: Session, folio_id: int) -> Folio:
    folio = session.get(Folio, folio_id)
    if folio is None:
        raise NotFound("Folio not found")
    return folio


def _require_open(folio: Folio) -> None:
    if folio.status is not FolioStatus.open:
        raise Conflict("Folio is closed")


class FolioServiceImpl:
    def get_or_open_folio(self, session: Session, *, reservation_id: int) -> int:
        folio = session.scalar(
            select(Folio)
            .where(Folio.reservation_id == reservation_id, Folio.is_primary.is_(True))
        )
        if folio is not None:
            return folio.id
        seq = (
            session.scalar(
                select(func.count(Folio.id)).where(Folio.reservation_id == reservation_id)
            )
            or 0
        ) + 1
        from app.modules.reservations.models import Reservation

        reservation = session.get(Reservation, reservation_id)
        if reservation is None:
            raise NotFound("Reservation not found")
        folio = Folio(
            reservation_id=reservation_id,
            code=f"F{reservation_id:06d}-{seq}",
            currency=reservation.currency,
            is_primary=True,
        )
        session.add(folio)
        session.flush()
        return folio.id

    def _apply_taxes(
        self, session: Session, charge: FolioLine, category: ChargeCategory
    ) -> None:
        rules = session.scalars(
            select(TaxRule)
            .where(TaxRule.is_active.is_(True))
            .order_by(TaxRule.sort_order, TaxRule.id)
        )
        for rule in rules:
            if category.value not in (rule.applies_to_categories or []):
                continue
            amount = 0
            if rule.percent is not None:
                amount += int(
                    (Decimal(charge.amount_minor) * Decimal(rule.percent) / Decimal(100)).quantize(
                        Decimal(1), rounding=ROUND_HALF_UP
                    )
                )
            if rule.fixed_minor is not None:
                amount += int(rule.fixed_minor) * charge.quantity
            if amount == 0:
                continue
            session.add(
                FolioLine(
                    folio_id=charge.folio_id,
                    kind=FolioLineKind.tax,
                    category=ChargeCategory.tax.value,
                    description=f"{rule.name} on {charge.description}",
                    quantity=1,
                    unit_amount_minor=amount,
                    amount_minor=amount,
                    posted_at=charge.posted_at,
                    posted_by=charge.posted_by,
                    source=charge.source,
                    parent_line_id=charge.id,
                )
            )
        session.flush()

    def post_charge(
        self,
        session: Session,
        *,
        folio_id: int,
        category: ChargeCategory,
        description: str,
        amount_minor: int,
        quantity: int = 1,
        actor_id: int | None = None,
        source: str = "manual",
        reference: str | None = None,
    ) -> int:
        folio = get_folio(session, folio_id)
        _require_open(folio)
        if quantity < 1:
            raise ValidationProblem("quantity must be >= 1")
        line = FolioLine(
            folio_id=folio_id,
            kind=FolioLineKind.charge,
            category=category.value,
            description=description,
            quantity=quantity,
            unit_amount_minor=amount_minor,
            amount_minor=amount_minor * quantity,
            posted_at=_now(),
            posted_by=actor_id,
            source=source,
            reference=reference or "",
        )
        session.add(line)
        session.flush()
        self._apply_taxes(session, line, category)
        return line.id

    def post_payment(
        self,
        session: Session,
        *,
        folio_id: int,
        method: PaymentMethod,
        amount_minor: int,
        actor_id: int | None = None,
        reference: str | None = None,
        received_at: datetime | None = None,
    ) -> int:
        folio = get_folio(session, folio_id)
        _require_open(folio)
        if amount_minor <= 0:
            raise ValidationProblem("payment amount must be positive")
        line = FolioLine(
            folio_id=folio_id,
            kind=FolioLineKind.payment,
            category="payment",
            description=f"Payment ({method.value})",
            quantity=1,
            unit_amount_minor=-amount_minor,
            amount_minor=-amount_minor,
            posted_at=_now(),
            posted_by=actor_id,
            source="manual",
            reference=reference or "",
        )
        session.add(line)
        session.flush()
        session.add(
            Payment(
                folio_line_id=line.id,
                method=method.value,
                received_at=received_at or _now(),
                reference=reference or "",
            )
        )
        session.flush()
        return line.id

    def void_line(
        self, session: Session, *, line_id: int, reason: str, actor_id: int | None = None
    ) -> None:
        line = session.get(FolioLine, line_id)
        if line is None:
            raise NotFound("Folio line not found")
        _require_open(get_folio(session, line.folio_id))
        if line.is_void:
            return
        line.is_void = True
        line.void_reason = reason
        for child in session.scalars(
            select(FolioLine).where(FolioLine.parent_line_id == line_id)
        ):
            child.is_void = True
            child.void_reason = f"parent voided: {reason}"
        session.flush()

    def balance_minor(self, session: Session, *, folio_id: int) -> int:
        get_folio(session, folio_id)
        return int(
            session.scalar(
                select(func.coalesce(func.sum(FolioLine.amount_minor), 0)).where(
                    FolioLine.folio_id == folio_id, FolioLine.is_void.is_(False)
                )
            )
            or 0
        )

    def close_folio(self, session: Session, *, folio_id: int) -> None:
        folio = get_folio(session, folio_id)
        if folio.status is FolioStatus.closed:
            return
        if self.balance_minor(session, folio_id=folio_id) != 0:
            raise Conflict("Cannot close a folio with a non-zero balance")
        folio.status = FolioStatus.closed
        folio.closed_at = _now()
        session.flush()

    def generate_invoice(
        self,
        session: Session,
        *,
        folio_id: int,
        bill_to_name: str = "",
        bill_to_address: str = "",
    ) -> Invoice:
        folio = get_folio(session, folio_id)
        active = [ln for ln in folio.lines if not ln.is_void]
        lines = [
            {
                "kind": ln.kind.value,
                "category": ln.category,
                "description": ln.description,
                "quantity": ln.quantity,
                "amount_minor": ln.amount_minor,
            }
            for ln in active
        ]
        charged = sum(
            ln.amount_minor for ln in active if ln.kind is not FolioLineKind.payment
        )
        paid = -sum(
            ln.amount_minor for ln in active if ln.kind is FolioLineKind.payment
        )
        year = _now().year
        seq = (
            session.scalar(
                select(func.count(Invoice.id)).where(
                    Invoice.number.like(f"INV-{year}-%")
                )
            )
            or 0
        ) + 1
        invoice = Invoice(
            folio_id=folio_id,
            number=f"INV-{year}-{seq:05d}",
            issued_at=_now(),
            bill_to_name=bill_to_name,
            bill_to_address=bill_to_address,
            currency=folio.currency,
            total_minor=charged,
            lines_json=[
                *lines,
                {"kind": "summary", "charged_minor": charged, "paid_minor": paid,
                 "balance_minor": charged - paid},
            ],
        )
        session.add(invoice)
        session.flush()
        return invoice


service_impl = FolioServiceImpl()
