"""Populate a fresh database with a demo property, rooms, rates and users.

    python -m app.jobs.seed_demo [--force]

Idempotent-ish: it skips creation when the admin user already exists unless
``--force`` is passed (which still won't duplicate uniquely-keyed rows).
"""

from __future__ import annotations

import argparse
import secrets
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import ChargeCategory
from app.core.security import hash_password
from app.modules.auth.models import Permission, Role, User
from app.modules.billing.models import TaxRule
from app.modules.guests.models import Guest
from app.modules.inventory.models import Room, RoomType
from app.modules.inventory.service import ensure_property
from app.modules.rates import service as rates_service
from app.modules.rates.models import DerivedMode, MealPlan, RatePlan
from app.modules.reservations import service as res_service

from ._common import bootstrap, log, session_scope
from .sync_permissions import sync_permissions

ROLE_PERMISSIONS = {
    "manager": "*",
    "front_desk": [
        "inventory.view",
        "rates.view",
        "guests.view",
        "guests.manage",
        "reservations.view",
        "reservations.manage",
        "frontdesk.operate",
        "billing.view",
        "billing.post",
        "billing.close",
    ],
    "housekeeping": ["inventory.view"],
}

ROOM_TYPES: list[dict[str, Any]] = [
    {"code": "STD", "name": "Standard Queen", "max_occupancy": 2, "max_adults": 2,
         "standard_occupancy": 2, "bed_configuration": "1 queen", "sort_order": 10, "rooms": 10,
         "rate": 15000},
    {"code": "DLX", "name": "Deluxe King", "max_occupancy": 3, "max_adults": 2,
         "standard_occupancy": 2, "bed_configuration": "1 king", "sort_order": 20, "rooms": 6,
         "rate": 22000},
    {"code": "SUITE", "name": "Executive Suite", "max_occupancy": 4, "max_adults": 3,
         "standard_occupancy": 2, "bed_configuration": "1 king + sofa bed", "sort_order": 30,
         "rooms": 4, "rate": 40000},
]


def _get_or_create_roles(session: Session) -> dict[str, Role]:
    all_perms = {p.code: p for p in session.scalars(select(Permission))}
    roles: dict[str, Role] = {}
    for code, perms in ROLE_PERMISSIONS.items():
        role = session.scalar(select(Role).where(Role.code == code))
        if role is None:
            role = Role(code=code, name=code.replace("_", " ").title())
            session.add(role)
        selected = list(all_perms.values()) if perms == "*" else [
            all_perms[c] for c in perms if c in all_perms
        ]
        role.permissions = selected
        roles[code] = role
    session.flush()
    return roles


def _seed_inventory(session: Session) -> dict[str, RoomType]:
    types: dict[str, RoomType] = {}
    for spec in ROOM_TYPES:
        rt = session.scalar(select(RoomType).where(RoomType.code == spec["code"]))
        if rt is None:
            rt = RoomType(
                code=spec["code"],
                name=spec["name"],
                max_occupancy=spec["max_occupancy"],
                max_adults=spec["max_adults"],
                standard_occupancy=spec["standard_occupancy"],
                bed_configuration=spec["bed_configuration"],
                sort_order=spec["sort_order"],
            )
            session.add(rt)
            session.flush()
        existing_rooms = session.scalar(
            select(Room).where(Room.room_type_id == rt.id).limit(1)
        )
        if existing_rooms is None:
            base = spec["sort_order"] * 10
            for i in range(1, spec["rooms"] + 1):
                session.add(
                    Room(number=str(base + i), floor=str(spec["sort_order"] // 10),
                         room_type_id=rt.id)
                )
        types[spec["code"]] = rt
    session.flush()
    return types


def _seed_rates(session: Session, types: dict[str, RoomType]) -> RatePlan:
    bar = session.scalar(select(RatePlan).where(RatePlan.code == "BAR"))
    if bar is None:
        bar = rates_service.create_rate_plan(
            session,
            {
                "code": "BAR",
                "name": "Best Available Rate",
                "currency": "AUD",
                "meal_plan": MealPlan.breakfast,
                "is_active": True,
                "room_type_ids": [rt.id for rt in types.values()],
                "free_cancel_until_days": 1,
                "cancellation_penalty_nights": 1,
                "cancellation_note": "Free cancellation until 1 day before arrival; "
                "otherwise 1 night is charged.",
            },
        )
    today = date.today()
    horizon = today + timedelta(days=180)
    for spec in ROOM_TYPES:
        rates_service.set_rates(
            session,
            rate_plan_id=bar.id,
            room_type_id=types[spec["code"]].id,
            start_date=today,
            end_date=horizon,
            amount_minor=spec["rate"],
        )

    if session.scalar(select(RatePlan).where(RatePlan.code == "NONREF")) is None:
        rates_service.create_rate_plan(
            session,
            {
                "code": "NONREF",
                "name": "Non-Refundable",
                "currency": "AUD",
                "meal_plan": MealPlan.breakfast,
                "is_active": True,
                "room_type_ids": [rt.id for rt in types.values()],
                "parent_rate_plan_id": bar.id,
                "derived_mode": DerivedMode.percent,
                "derived_value": -10,
                "free_cancel_until_days": 0,
                "cancellation_penalty_nights": 99,
                "cancellation_note": "Non-refundable. Full stay charged on cancellation.",
            },
        )
    return bar


def _seed_tax(session: Session) -> None:
    if session.scalar(select(TaxRule).where(TaxRule.name == "GST")) is None:
        session.add(
            TaxRule(
                name="GST",
                percent=10,
                applies_to_categories=[
                    ChargeCategory.room.value,
                    ChargeCategory.room_service.value,
                    ChargeCategory.food_beverage.value,
                    ChargeCategory.fee.value,
                    ChargeCategory.misc.value,
                ],
                is_active=True,
            )
        )
        session.flush()


def _seed_demo_reservation(session: Session, bar: RatePlan, types: dict[str, RoomType]) -> None:
    if session.scalar(select(Guest).limit(1)) is not None:
        return
    guest = Guest(first_name="Ada", last_name="Lovelace", email="ada@example.com",
                  phone="+61400000001", nationality="GB")
    session.add(guest)
    session.flush()
    arrival = date.today() + timedelta(days=7)
    res_service.create_reservation(
        session,
        payload={
            "primary_guest_id": guest.id,
            "source": "direct",
            "status": "confirmed",
            "rooms": [
                {
                    "room_type_id": types["DLX"].id,
                    "rate_plan_id": bar.id,
                    "arrival": arrival,
                    "departure": arrival + timedelta(days=3),
                    "adults": 2,
                    "children": 0,
                }
            ],
        },
        actor_id=None,
    )


def seed(session: Session, *, force: bool) -> str | None:
    sync_permissions(session)
    _get_or_create_roles(session)

    admin = session.scalar(select(User).where(User.username == "admin"))
    password: str | None = None
    if admin is None:
        password = secrets.token_urlsafe(12)
        admin = User(
            username="admin",
            full_name="System Administrator",
            hashed_password=hash_password(password),
            is_superuser=True,
        )
        session.add(admin)
    elif not force:
        log.info("admin user already exists; use --force to re-run the rest of the seed")

    ensure_property(session)
    types = _seed_inventory(session)
    bar = _seed_rates(session, types)
    _seed_tax(session)
    _seed_demo_reservation(session, bar, types)
    return password


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    bootstrap()
    with session_scope() as session:
        password = seed(session, force=args.force)

    log.info("seed complete.")
    if password:
        log.info("  admin login:  admin / %s", password)
    else:
        log.info("  admin already existed - password unchanged")


if __name__ == "__main__":
    main()
