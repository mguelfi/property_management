"""Vocabulary shared across module boundaries (part of core service contracts)."""

from __future__ import annotations

import enum


class ChargeCategory(enum.StrEnum):
    room = "room"
    room_service = "room_service"
    food_beverage = "food_beverage"
    tax = "tax"
    deposit = "deposit"
    fee = "fee"
    cancellation = "cancellation"
    upgrade = "upgrade"
    misc = "misc"


class PaymentMethod(enum.StrEnum):
    cash = "cash"
    card_terminal = "card_terminal"
    bank_transfer = "bank_transfer"
    ota_collected = "ota_collected"
    voucher = "voucher"
    other = "other"


class FolioLineKind(enum.StrEnum):
    charge = "charge"
    payment = "payment"
    tax = "tax"
    adjustment = "adjustment"
