"""Database engine, session factory, and the shared declarative base.

Every module's ORM models inherit from :class:`Base`, so they all share one
``MetaData`` and one Alembic migration history (single-deployment design).
"""

from __future__ import annotations

import enum
from collections.abc import Iterator
from datetime import UTC, datetime

from sqlalchemy import DateTime, MetaData, create_engine
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.core.config import get_settings


def str_enum(enum_cls: type[enum.Enum]) -> SAEnum:
    """A portable enum column: stored as VARCHAR + CHECK, not a native PG type.

    Native PG ENUM types make "add a value later" (new room status, payment
    method, channel) a migration ordeal; a checked string does not.
    """
    return SAEnum(enum_cls, native_enum=False, length=40, validate_strings=True)

# Predictable constraint names → clean Alembic autogenerate diffs.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


_settings = get_settings()
engine = create_engine(
    _settings.database_url,
    echo=_settings.sql_echo,
    pool_pre_ping=True,
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: a session that commits on success, rolls back on error."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
