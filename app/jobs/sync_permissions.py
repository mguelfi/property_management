"""Upsert every enabled module's declared permissions into ``auth_permissions``.

    python -m app.jobs.sync_permissions
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.registry import load_modules
from app.modules.auth.models import Permission

from ._common import bootstrap, log, session_scope


def sync_permissions(session: Session) -> int:
    existing = {p.code: p for p in session.scalars(select(Permission))}
    changed = 0
    for mod in load_modules():
        for code, description in mod.permissions:
            perm = existing.get(code)
            if perm is None:
                session.add(Permission(code=code, description=description))
                changed += 1
            elif perm.description != description:
                perm.description = description
                changed += 1
    session.flush()
    return changed


def main() -> None:
    bootstrap()
    with session_scope() as session:
        n = sync_permissions(session)
    log.info("permissions synced (%d added/updated)", n)


if __name__ == "__main__":
    main()
