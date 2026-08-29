"""Mark still-unarrived confirmed reservations as no-show and release inventory.

    python -m app.jobs.release_no_shows [--date YYYY-MM-DD]
"""

from __future__ import annotations

import argparse
from datetime import date

from app.modules.frontdesk import service as fd_service

from ._common import bootstrap, log, session_scope


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", type=date.fromisoformat, default=None)
    args = parser.parse_args()
    as_of = args.date or date.today()

    bootstrap()
    with session_scope() as session:
        marked = fd_service.no_show_sweep(session, as_of)
    log.info("marked %d reservation(s) as no-show: %s", len(marked), marked)


if __name__ == "__main__":
    main()
