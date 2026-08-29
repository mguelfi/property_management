"""Post the previous night's room charge (+ tax) to each in-house folio.

    python -m app.jobs.post_room_charges [--date YYYY-MM-DD]

Idempotent: each ``ReservationRoomNight`` is flagged ``posted`` once its charge
has been pushed, so re-running the job is safe.
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import ChargeCategory
from app.core.service_registry import get_service
from app.core.services import FolioService
from app.modules.reservations.models import (
    Reservation,
    ReservationRoom,
    ReservationStatus,
)

from ._common import bootstrap, log, session_scope


def post_for_night(session: Session, night: date) -> int:
    folio: FolioService = get_service(FolioService)
    reservations = session.scalars(
        select(Reservation)
        .where(Reservation.status == ReservationStatus.in_house)
        .options(
            selectinload(Reservation.rooms).selectinload(ReservationRoom.nightly_rates)
        )
    )
    posted = 0
    for reservation in reservations:
        folio_id = folio.get_or_open_folio(session, reservation_id=reservation.id)
        for room in reservation.rooms:
            for rn in room.nightly_rates:
                if rn.date != night or rn.posted:
                    continue
                folio.post_charge(
                    session,
                    folio_id=folio_id,
                    category=ChargeCategory.room,
                    description=f"Room {room.room_type_id} - night of {night.isoformat()}",
                    amount_minor=rn.amount_minor,
                    source="night_audit",
                    reference=f"{reservation.reference}/{rn.id}",
                )
                rn.posted = True
                posted += 1
    session.flush()
    return posted


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", type=date.fromisoformat, default=None,
                        help="the night to post (default: yesterday)")
    args = parser.parse_args()
    night = args.date or (date.today() - timedelta(days=1))

    bootstrap()
    with session_scope() as session:
        n = post_for_night(session, night)
    log.info("posted %d room-night charge(s) for %s", n, night.isoformat())


if __name__ == "__main__":
    main()
