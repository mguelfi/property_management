from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import ChargeCategory, PaymentMethod


class ChargeIn(BaseModel):
    category: ChargeCategory = ChargeCategory.misc
    description: str = Field(min_length=1, max_length=255)
    amount_minor: int
    quantity: int = Field(default=1, ge=1)
    reference: str | None = None


class PaymentIn(BaseModel):
    method: PaymentMethod
    amount_minor: int = Field(gt=0)
    reference: str | None = None
    received_at: datetime | None = None


class VoidIn(BaseModel):
    reason: str = Field(min_length=1, max_length=255)


class FolioLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    category: str
    description: str
    quantity: int
    amount_minor: int
    tax_component_minor: int = 0
    posted_at: datetime
    source: str
    reference: str
    parent_line_id: int | None
    is_void: bool


class FolioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reservation_id: int
    code: str
    status: str
    currency: str
    is_primary: bool
    lines: list[FolioLineOut]
    balance_minor: int = 0
    gst_minor: int = 0


class TaxRuleIn(BaseModel):
    name: str
    percent: Decimal | None = Field(default=None, ge=0)
    fixed_minor: int | None = Field(default=None, ge=0)
    applies_to_categories: list[ChargeCategory] = []
    is_active: bool = True
    sort_order: int = 100
    tax_inclusive: bool = False


class TaxRuleUpdate(BaseModel):
    name: str | None = None
    percent: Decimal | None = Field(default=None, ge=0)
    fixed_minor: int | None = Field(default=None, ge=0)
    applies_to_categories: list[ChargeCategory] | None = None
    is_active: bool | None = None
    sort_order: int | None = None
    tax_inclusive: bool | None = None


class TaxRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    percent: Decimal | None
    fixed_minor: int | None
    applies_to_categories: list[str]
    is_active: bool
    sort_order: int
    tax_inclusive: bool


class InvoiceIn(BaseModel):
    bill_to_name: str = ""
    bill_to_address: str = ""


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    folio_id: int
    number: str
    issued_at: datetime
    bill_to_name: str
    bill_to_address: str
    currency: str
    total_minor: int
    lines_json: list[dict]
