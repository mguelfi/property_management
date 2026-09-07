"""Reversers for frontdesk domain events, registered with the generic undo
registry (``app.core.undo``) in ``app.modules.frontdesk.__init__``.

Each reverser gates on the specific field it's reversing still holding
exactly the value the original action produced — not on a timestamp/version
snapshot — so a LIFO chain of self-undos keeps working (see the plan's
"Concurrency check" note) while a genuine third-party change is still caught.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound
from app.core.service_registry import get_service
from app.core.services import FolioService
from app.modules.reservations import service as res_service
from app.modules.reservations.models import ReservationRoom, ReservationStatus

from . import service
from .events import GuestCheckedIn, GuestCheckedOut, RoomAssigned, RoomUpgraded


def _folio() -> FolioService:
    return get_service(FolioService)


def revert_room_assigned(event: RoomAssigned, session: Session) -> None:
    line = session.get(ReservationRoom, event.reservation_room_id)
    if line is None:
        raise NotFound("Reservation room line not found")
    if line.assigned_room_id != event.room_id:
        raise Conflict("Room assignment has changed since this action")
    if event.previous_room_id is not None:
        service.assign_room(
            session,
            reservation_id=line.reservation_id,
            line_id=line.id,
            room_id=event.previous_room_id,
            actor_id=event.actor_id,
            allow_type_mismatch=True,
            note="undo of assignment",
        )
    else:
        service.release_room(
            session,
            reservation_id=line.reservation_id,
            line_id=line.id,
            actor_id=event.actor_id,
        )


def revert_room_upgraded(event: RoomUpgraded, session: Session) -> None:
    if event.folio_line_id is None:
        raise Conflict("Nothing to undo for a zero-amount upgrade")
    _folio().void_line(
        session,
        line_id=event.folio_line_id,
        reason="undo of room upgrade",
        actor_id=event.actor_id,
        require_active=True,
    )


def revert_guest_checked_in(event: GuestCheckedIn, session: Session) -> None:
    reservation = res_service.get_reservation(session, event.reservation_id)
    if reservation.status is not ReservationStatus.in_house:
        raise Conflict("Reservation status has changed since check-in")
    reservation.status = ReservationStatus.confirmed
    reservation.checked_in_at = None
    session.flush()


def revert_guest_checked_out(event: GuestCheckedOut, session: Session) -> None:
    reservation = res_service.get_reservation(session, event.reservation_id)
    if reservation.status is not ReservationStatus.checked_out:
        raise Conflict("Reservation status has changed since check-out")
    reservation.status = ReservationStatus.in_house
    reservation.checked_out_at = None
    if event.folio_closed_by_this_action:
        from app.modules.billing.models import Folio as FolioModel
        from app.modules.billing.models import FolioStatus as FolioStatusEnum

        folio = session.get(FolioModel, event.folio_id)
        if folio is not None and folio.status is FolioStatusEnum.closed:
            folio.status = FolioStatusEnum.open
            folio.closed_at = None
    session.flush()
