from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.daterange import night_count, nights
from app.core.errors import NoAvailability, NotFound, RateClosed, ValidationProblem
from app.core.services import (
    NightRate,
    RatePlanOffer,
    RateQuote,
    RoomTypeOffer,
)
from app.modules.inventory.models import Room, RoomBlock, RoomType
from app.modules.rates import service as rates_service
from app.modules.rates.models import RatePlan, RatePlanRoomType

from .models import InventoryLedger

# --------------------------------------------------------------------------- #
# Physical capacity
# --------------------------------------------------------------------------- #


def _active_room_count(session: Session, room_type_id: int) -> int:
    return session.scalar(
        select(func.count(Room.id)).where(
            Room.room_type_id == room_type_id, Room.is_active.is_(True)
        )
    ) or 0


def _blocked_units(session: Session, room_type_id: int, day: date) -> int:
    room_blocks = session.scalar(
        select(func.count(func.distinct(RoomBlock.room_id)))
        .select_from(RoomBlock)
        .join(Room, Room.id == RoomBlock.room_id)
        .where(
            Room.room_type_id == room_type_id,
            RoomBlock.start_date <= day,
            RoomBlock.end_date > day,
        )
    ) or 0
    type_blocks = session.scalar(
        select(func.coalesce(func.sum(RoomBlock.units), 0)).where(
            RoomBlock.room_id.is_(None),
            RoomBlock.room_type_id == room_type_id,
            RoomBlock.start_date <= day,
            RoomBlock.end_date > day,
        )
    ) or 0
    return int(room_blocks) + int(type_blocks)


def capacity(session: Session, room_type: RoomType, day: date) -> int:
    physical = _active_room_count(session, room_type.id) - _blocked_units(
        session, room_type.id, day
    )
    return max(physical, 0) + room_type.overbooking_allowance


# --------------------------------------------------------------------------- #
# Ledger
# --------------------------------------------------------------------------- #


def _sold(session: Session, room_type_id: int, day: date) -> int:
    return session.scalar(
        select(InventoryLedger.sold_units).where(
            InventoryLedger.room_type_id == room_type_id, InventoryLedger.date == day
        )
    ) or 0


def _locked_ledger_row(session: Session, room_type_id: int, day: date) -> InventoryLedger:
    session.execute(
        pg_insert(InventoryLedger)
        .values(room_type_id=room_type_id, date=day, sold_units=0)
        .on_conflict_do_nothing(index_elements=["room_type_id", "date"])
    )
    row = session.scalar(
        select(InventoryLedger)
        .where(InventoryLedger.room_type_id == room_type_id, InventoryLedger.date == day)
        .with_for_update()
    )
    assert row is not None  # just inserted-or-existing
    return row


class AvailabilityServiceImpl:
    """Registered as :class:`app.core.services.AvailabilityService`."""

    def units_available(
        self, session: Session, room_type: RoomType, arrival: date, departure: date
    ) -> int:
        return min(
            (
                capacity(session, room_type, day) - _sold(session, room_type.id, day)
                for day in nights(arrival, departure)
            ),
            default=0,
        )

    # -- reads ------------------------------------------------------------- #

    def search(
        self,
        session: Session,
        *,
        arrival: date,
        departure: date,
        adults: int,
        children: int = 0,
        room_type_id: int | None = None,
        multi_room: bool = False,
    ) -> list[RoomTypeOffer]:
        if departure <= arrival:
            raise ValidationProblem("departure must be after arrival")
        guests = adults + children
        stmt = select(RoomType).where(RoomType.is_active.is_(True))
        if room_type_id is not None:
            stmt = stmt.where(RoomType.id == room_type_id)
        offers: list[RoomTypeOffer] = []
        for rt in session.scalars(stmt.order_by(RoomType.sort_order, RoomType.code)):
            if not multi_room and (rt.max_occupancy < guests or rt.max_adults < adults):
                continue
            units = max(self.units_available(session, rt, arrival, departure), 0)
            plans = self._rate_plan_offers(session, rt.id, arrival, departure)
            offers.append(
                RoomTypeOffer(
                    room_type_id=rt.id,
                    room_type_code=rt.code,
                    room_type_name=rt.name,
                    max_occupancy=rt.max_occupancy,
                    units_available=units,
                    rate_plans=tuple(plans),
                )
            )
        return offers

    def _rate_plan_offers(
        self, session: Session, room_type_id: int, arrival: date, departure: date
    ) -> list[RatePlanOffer]:
        plans = session.scalars(
            select(RatePlan)
            .join(RatePlanRoomType, RatePlanRoomType.rate_plan_id == RatePlan.id)
            .where(
                RatePlanRoomType.room_type_id == room_type_id,
                RatePlan.is_active.is_(True),
            )
            .order_by(RatePlan.code)
        )
        result: list[RatePlanOffer] = []
        for plan in plans:
            total = 0
            priced = True
            for day in nights(arrival, departure):
                amount = rates_service.nightly_amount(session, plan, room_type_id, day)
                if amount is None:
                    priced = False
                    break
                total += amount
            if not priced:
                continue
            result.append(
                RatePlanOffer(
                    rate_plan_id=plan.id,
                    rate_plan_code=plan.code,
                    rate_plan_name=plan.name,
                    currency=plan.currency,
                    total_minor=total,
                    restrictions=self._restriction_reasons(
                        session, plan.id, room_type_id, arrival, departure
                    ),
                )
            )
        return result

    def _restriction_reasons(
        self,
        session: Session,
        rate_plan_id: int,
        room_type_id: int,
        arrival: date,
        departure: date,
    ) -> tuple[str, ...]:
        reasons: list[str] = []
        los = night_count(arrival, departure)
        for day in nights(arrival, departure):
            r = rates_service.restriction_for(session, rate_plan_id, room_type_id, day)
            if r is None:
                continue
            if r.closed:
                reasons.append(f"closed:{day.isoformat()}")
            if day == arrival and r.closed_to_arrival:
                reasons.append("closed_to_arrival")
            if day == arrival and los < r.min_stay:
                reasons.append(f"min_stay:{r.min_stay}")
            if day == arrival and r.max_stay is not None and los > r.max_stay:
                reasons.append(f"max_stay:{r.max_stay}")
        last_night = departure  # departure day itself: check CTD
        r_dep = rates_service.restriction_for(
            session, rate_plan_id, room_type_id, last_night
        )
        if r_dep is not None and r_dep.closed_to_departure:
            reasons.append("closed_to_departure")
        return tuple(dict.fromkeys(reasons))

    def quote(
        self,
        session: Session,
        *,
        room_type_id: int,
        rate_plan_id: int,
        arrival: date,
        departure: date,
    ) -> RateQuote:
        if departure <= arrival:
            raise ValidationProblem("departure must be after arrival")
        plan = session.get(RatePlan, rate_plan_id)
        if plan is None:
            raise NotFound("Rate plan not found")
        if room_type_id not in plan.room_type_ids:
            raise ValidationProblem("Rate plan does not sell this room type")

        reasons = self._restriction_reasons(
            session, rate_plan_id, room_type_id, arrival, departure
        )
        blocking = [r for r in reasons if not r.startswith(("min_stay", "max_stay"))]
        if blocking:
            raise RateClosed(f"Rate not sellable: {', '.join(reasons)}")
        stay = [r for r in reasons if r.startswith(("min_stay", "max_stay"))]
        if stay:
            raise ValidationProblem(f"Length-of-stay restriction: {', '.join(stay)}")

        night_rates: list[NightRate] = []
        for day in nights(arrival, departure):
            amount = rates_service.nightly_amount(session, plan, room_type_id, day)
            if amount is None:
                raise RateClosed(f"No rate loaded for {day.isoformat()}")
            night_rates.append(NightRate(date=day, amount_minor=amount))

        return RateQuote(
            room_type_id=room_type_id,
            rate_plan_id=rate_plan_id,
            currency=plan.currency,
            arrival=arrival,
            departure=departure,
            nights=tuple(night_rates),
            total_minor=sum(n.amount_minor for n in night_rates),
        )

    # -- writes ---------------------------------------------------------- #

    def reserve(
        self,
        session: Session,
        *,
        room_type_id: int,
        arrival: date,
        departure: date,
        units: int = 1,
    ) -> None:
        rt = session.get(RoomType, room_type_id)
        if rt is None:
            raise NotFound("Room type not found")
        for day in nights(arrival, departure):
            row = _locked_ledger_row(session, room_type_id, day)
            if row.sold_units + units > capacity(session, rt, day):
                raise NoAvailability(
                    f"No availability for {rt.code} on {day.isoformat()}"
                )
            row.sold_units += units
        session.flush()

    def release(
        self,
        session: Session,
        *,
        room_type_id: int,
        arrival: date,
        departure: date,
        units: int = 1,
    ) -> None:
        for day in nights(arrival, departure):
            row = _locked_ledger_row(session, room_type_id, day)
            row.sold_units = max(row.sold_units - units, 0)
        session.flush()


service_impl = AvailabilityServiceImpl()
