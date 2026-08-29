from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CompanyIn(BaseModel):
    name: str
    is_travel_agent: bool = False
    commission_pct: Decimal | None = Field(default=None, ge=0, le=100)
    tax_id: str = ""
    email: str = ""
    phone: str = ""
    billing_address: str = ""
    notes: str = ""


class CompanyOut(CompanyIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class GuestIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr | None = None
    phone: str | None = None
    date_of_birth: date | None = None
    nationality: str = ""
    address_line1: str = ""
    address_line2: str = ""
    city: str = ""
    region: str = ""
    postcode: str = ""
    country: str = ""
    id_document_type: str = ""
    id_document_number: str = ""
    company_id: int | None = None
    marketing_consent: bool = False
    notes: str = ""


class GuestUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    date_of_birth: date | None = None
    nationality: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    region: str | None = None
    postcode: str | None = None
    country: str | None = None
    id_document_type: str | None = None
    id_document_number: str | None = None
    company_id: int | None = None
    marketing_consent: bool | None = None
    notes: str | None = None


class GuestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    first_name: str
    last_name: str
    full_name: str
    email: str | None
    phone: str | None
    date_of_birth: date | None
    nationality: str
    city: str
    country: str
    company_id: int | None
    marketing_consent: bool
    notes: str
