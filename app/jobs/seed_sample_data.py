"""Populate a realistic few days of front-desk activity on top of
``seed_demo``: past stays already checked out, guests currently in-house,
today's arrivals (one unassigned, one ready for a one-click check-in) and
departures, a stale confirmed booking ripe for the no-show sweep, and a
handful of future confirmed bookings — enough to exercise every tab of the
front desk board without hand-clicking through the UI first.

    python -m app.jobs.seed_sample_data [--force]

Idempotent-ish: skips if sample guests (marked with an @sample.test email)
already exist, unless --force is passed (which adds another batch rather
than deduplicating).
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import ChargeCategory, PaymentMethod
from app.core.service_registry import get_service
from app.core.services import FolioService
from app.modules.frontdesk import service as fd_service
from app.modules.guests.models import Guest
from app.modules.inventory.models import Room, RoomType
from app.modules.rates import service as rates_service
from app.modules.rates.models import RatePlan
from app.modules.reservations import service as res_service
from app.modules.reservations.models import Reservation

from ._common import bootstrap, log, session_scope

SAMPLE_DOMAIN = "@sample.test"
HISTORY_DAYS = 10
FUTURE_DAYS = 30


def _folio() -> FolioService:
    return get_service(FolioService)


def _room_type(session: Session, code: str) -> RoomType:
    rt = session.scalar(select(RoomType).where(RoomType.code == code))
    if rt is None:
        raise RuntimeError(f"Room type {code} not found -- run seed_demo first")
    return rt


def _room(session: Session, number: str) -> Room:
    room = session.scalar(select(Room).where(Room.number == number))
    if room is None:
        raise RuntimeError(f"Room {number} not found -- run seed_demo first")
    return room


def _rate_plan(session: Session) -> RatePlan:
    plan = session.scalar(select(RatePlan).where(RatePlan.code == "BAR"))
    if plan is None:
        raise RuntimeError("Rate plan BAR not found -- run seed_demo first")
    return plan


def _extend_rate_coverage(session: Session, plan: RatePlan, room_types: list[RoomType]) -> None:
    """seed_demo only prices the calendar from today onward; backfill a
    history window too so past-dated demo bookings can be quoted."""
    today = date.today()
    start = today - timedelta(days=HISTORY_DAYS)
    for rt in room_types:
        today_amount = rates_service.nightly_amount(session, plan, rt.id, today)
        if today_amount is None:
            raise RuntimeError(f"No rate loaded for {rt.code} on {today} -- run seed_demo first")
        rates_service.set_rates(
            session,
            rate_plan_id=plan.id,
            room_type_id=rt.id,
            start_date=start,
            end_date=today,
            amount_minor=today_amount,
        )


def _guest(session: Session, first: str, last: str) -> Guest:
    guest = Guest(first_name=first, last_name=last, email=f"{first}.{last}{SAMPLE_DOMAIN}".lower())
    session.add(guest)
    session.flush()
    return guest


def _book(
    session: Session,
    *,
    guest: Guest,
    plan: RatePlan,
    room_type: RoomType,
    arrival: date,
    departure: date,
) -> Reservation:
    return res_service.create_reservation(
        session,
        payload={
            "primary_guest_id": guest.id,
            "source": "direct",
            "status": "confirmed",
            "rooms": [
                {
                    "room_type_id": room_type.id,
                    "rate_plan_id": plan.id,
                    "arrival": arrival,
                    "departure": departure,
                    "adults": 2,
                    "children": 0,
                }
            ],
        },
        actor_id=None,
    )


def seed(session: Session, *, force: bool) -> None:
    already = session.scalar(
        select(Guest).where(Guest.email.like(f"%{SAMPLE_DOMAIN}")).limit(1)
    )
    if already is not None and not force:
        log.info("sample data already present; use --force to add another batch")
        return

    std = _room_type(session, "STD")
    dlx = _room_type(session, "DLX")
    suite = _room_type(session, "SUITE")
    plan = _rate_plan(session)
    _extend_rate_coverage(session, plan, [std, dlx, suite])
    today = date.today()

    # -- past stays, already checked out ---------------------------------- #
    g1 = _guest(session, "Priya", "Kapoor")
    res1 = _book(
        session, guest=g1, plan=plan, room_type=std,
        arrival=today - timedelta(days=3), departure=today - timedelta(days=1),
    )
    line = res1.rooms[0]
    fd_service.assign_room(
        session, reservation_id=res1.id, line_id=line.id,
        room_id=_room(session, "104").id, actor_id=None,
    )
    fd_service.check_in(session, reservation_id=res1.id, actor_id=None)
    fd_service.check_out(session, reservation_id=res1.id, actor_id=None, allow_balance=True)

    g2 = _guest(session, "Marcus", "Ferreira")
    res2 = _book(
        session, guest=g2, plan=plan, room_type=dlx,
        arrival=today - timedelta(days=4), departure=today - timedelta(days=2),
    )
    line = res2.rooms[0]
    fd_service.assign_room(
        session, reservation_id=res2.id, line_id=line.id,
        room_id=_room(session, "202").id, actor_id=None,
    )
    fd_service.check_in(session, reservation_id=res2.id, actor_id=None)
    fd_service.check_out(session, reservation_id=res2.id, actor_id=None, allow_balance=True)

    # -- in-house, departs today (Front Desk > Departures) ---------------- #
    g3 = _guest(session, "Sofia", "Nilsson")
    res3 = _book(
        session, guest=g3, plan=plan, room_type=std,
        arrival=today - timedelta(days=2), departure=today,
    )
    line = res3.rooms[0]
    fd_service.assign_room(
        session, reservation_id=res3.id, line_id=line.id,
        room_id=_room(session, "105").id, actor_id=None,
    )
    fd_service.check_in(session, reservation_id=res3.id, actor_id=None)

    # -- in-house a while longer, with folio activity to look at ---------- #
    g4 = _guest(session, "Diego", "Alvarez")
    res4 = _book(
        session, guest=g4, plan=plan, room_type=dlx,
        arrival=today - timedelta(days=1), departure=today + timedelta(days=2),
    )
    line = res4.rooms[0]
    fd_service.assign_room(
        session, reservation_id=res4.id, line_id=line.id,
        room_id=_room(session, "203").id, actor_id=None,
    )
    fd_service.check_in(session, reservation_id=res4.id, actor_id=None)
    folio_id = _folio().get_or_open_folio(session, reservation_id=res4.id)
    _folio().post_charge(
        session, folio_id=folio_id, category=ChargeCategory.room_service,
        description="Room service - breakfast", amount_minor=3200, source="manual",
    )
    _folio().post_payment(
        session, folio_id=folio_id, method=PaymentMethod.card_terminal, amount_minor=3200,
    )

    # -- arriving today, unassigned (Front Desk > Arrivals: needs a room) - #
    g5 = _guest(session, "Leilani", "Nguyen")
    _book(session, guest=g5, plan=plan, room_type=std, arrival=today, departure=today + timedelta(days=2))

    # -- arriving today, already assigned (one-click check-in) ------------ #
    g6 = _guest(session, "Tomasz", "Wysocki")
    res6 = _book(
        session, guest=g6, plan=plan, room_type=std,
        arrival=today, departure=today + timedelta(days=3),
    )
    line = res6.rooms[0]
    fd_service.assign_room(
        session, reservation_id=res6.id, line_id=line.id,
        room_id=_room(session, "106").id, actor_id=None,
    )

    # -- future confirmed bookings ----------------------------------------- #
    g7 = _guest(session, "Amara", "Okafor")
    res7 = _book(
        session, guest=g7, plan=plan, room_type=dlx,
        arrival=today + timedelta(days=1), departure=today + timedelta(days=3),
    )
    line = res7.rooms[0]
    fd_service.assign_room(
        session, reservation_id=res7.id, line_id=line.id,
        room_id=_room(session, "204").id, actor_id=None,
    )

    g8 = _guest(session, "Haruto", "Sato")
    res8 = _book(
        session, guest=g8, plan=plan, room_type=suite,
        arrival=today + timedelta(days=2), departure=today + timedelta(days=4),
    )
    line = res8.rooms[0]
    fd_service.assign_room(
        session, reservation_id=res8.id, line_id=line.id,
        room_id=_room(session, "301").id, actor_id=None,
    )

    g9 = _guest(session, "Ines", "Duarte")
    _book(
        session, guest=g9, plan=plan, room_type=suite,
        arrival=today + timedelta(days=3), departure=today + timedelta(days=6),
    )

    # -- stale confirmed booking, ripe for the no-show sweep --------------- #
    g10 = _guest(session, "Callum", "Whitfield")
    _book(
        session, guest=g10, plan=plan, room_type=std,
        arrival=today - timedelta(days=1), departure=today + timedelta(days=1),
    )

    log.info(
        "seeded 10 sample reservations spanning %s to %s",
        (today - timedelta(days=4)).isoformat(),
        (today + timedelta(days=6)).isoformat(),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    bootstrap()
    with session_scope() as session:
        seed(session, force=args.force)
    log.info("done.")


if __name__ == "__main__":
    main()
