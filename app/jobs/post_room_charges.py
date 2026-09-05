"""Post the previous night's room charge (+ tax) to each in-house folio.

    python -m app.jobs.post_room_charges [--date YYYY-MM-DD]

Idempotent: each ``ReservationRoomNight`` is flagged ``posted`` once its charge
has been pushed, so re-running the job is safe. Logic lives in
``app.modules.frontdesk.service.post_room_charges`` (also reachable via
``POST /api/frontdesk/night-audit``); this is a thin CLI wrapper for running
charge-posting alone, independent of the no-show sweep.
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta

from app.modules.frontdesk import service as fd_service

from ._common import bootstrap, log, session_scope


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", type=date.fromisoformat, default=None,
                        help="the night to post (default: yesterday)")
    args = parser.parse_args()
    night = args.date or (date.today() - timedelta(days=1))

    bootstrap()
    with session_scope() as session:
        n = fd_service.post_room_charges(session, night)
    log.info("posted %d room-night charge(s) for %s", n, night.isoformat())


if __name__ == "__main__":
    main()
