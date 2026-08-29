"""Lightweight builders for domain objects, operating on a Session directly."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.modules.guests.models import Guest
from app.modules.inventory.models import Property, Room, RoomType
from app.modules.rates import service as rates_service
from app.modules.rates.models import RatePlan


def make_property(db: Session, *, currency: str = "AUD") -> Property:
    prop = db.get(Property, 1)
    if prop is None:
        prop = Property(id=1, name="Test Hotel", currency=currency, timezone="UTC")
        db.add(prop)
        db.flush()
    return prop


def make_room_type(
    db: Session,
    *,
    code: str = "STD",
    rooms: int = 3,
    max_occupancy: int = 2,
    max_adults: int = 2,
    overbooking_allowance: int = 0,
) -> RoomType:
    rt = RoomType(
        code=code,
        name=f"{code} room",
        max_occupancy=max_occupancy,
        max_adults=max_adults,
        standard_occupancy=2,
        overbooking_allowance=overbooking_allowance,
    )
    db.add(rt)
    db.flush()
    for i in range(rooms):
        db.add(Room(number=f"{code}-{i + 1}", room_type_id=rt.id))
    db.flush()
    return rt


def make_rate_plan(
    db: Session,
    room_types: list[RoomType],
    *,
    code: str = "BAR",
    nightly_minor: int = 15000,
    days: int = 120,
    currency: str = "AUD",
) -> RatePlan:
    plan = rates_service.create_rate_plan(
        db,
        {
            "code": code,
            "name": code,
            "currency": currency,
            "is_active": True,
            "room_type_ids": [rt.id for rt in room_types],
            "free_cancel_until_days": 1,
            "cancellation_penalty_nights": 1,
        },
    )
    today = date.today()
    for rt in room_types:
        rates_service.set_rates(
            db,
            rate_plan_id=plan.id,
            room_type_id=rt.id,
            start_date=today - timedelta(days=1),
            end_date=today + timedelta(days=days),
            amount_minor=nightly_minor,
        )
    return plan


def make_guest(db: Session, *, last_name: str = "Tester") -> Guest:
    guest = Guest(first_name="Test", last_name=last_name, email=f"{last_name}@x.test")
    db.add(guest)
    db.flush()
    return guest


def standard_setup(db: Session) -> dict[str, object]:
    make_property(db)
    rt = make_room_type(db, rooms=2)
    plan = make_rate_plan(db, [rt])
    guest = make_guest(db)
    return {"room_type": rt, "rate_plan": plan, "guest": guest}
