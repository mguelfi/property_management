from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

os.environ.setdefault(
    "PMS_DATABASE_URL",
    "postgresql+psycopg://pms:pms@localhost:5432/pms_test",
)
os.environ.setdefault("PMS_SECRET_KEY", "test-secret-" + "x" * 40)

from app.core import db as db_module  # noqa: E402
from app.core.db import Base, get_db  # noqa: E402
from app.core.registry import build_app, import_model_metadata  # noqa: E402
from app.core.security import hash_password  # noqa: E402

TEST_DB_URL = os.environ["PMS_DATABASE_URL"]


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    import_model_metadata()
    eng = create_engine(TEST_DB_URL, future=True)
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    # Point the app's module-level engine/session factory at the test engine.
    db_module.engine = eng
    db_module.SessionLocal.configure(bind=eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    connection = engine.connect()
    trans = connection.begin()
    session = Session(
        bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
    )
    yield session
    session.close()
    trans.rollback()
    connection.close()


@pytest.fixture
def app(db: Session) -> FastAPI:
    application = build_app()

    def _override_get_db() -> Iterator[Session]:
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise

    application.dependency_overrides[get_db] = _override_get_db
    return application


@pytest.fixture
def client(app: FastAPI) -> Iterator[object]:
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        yield c


# --------------------------------------------------------------------------- #
# Auth helpers
# --------------------------------------------------------------------------- #


@pytest.fixture
def superuser(db: Session):
    from app.modules.auth.models import User

    user = User(
        username="root",
        full_name="Root",
        hashed_password=hash_password("secret123"),
        is_superuser=True,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def auth_headers(client, superuser) -> dict[str, str]:
    resp = client.post(
        "/api/auth/login", data={"username": "root", "password": "secret123"}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture(scope="session", autouse=True)
def _real_engine_for_direct_use(engine: Engine) -> None:
    """Ensures the session-scoped engine (and its schema) exists before tests
    that talk to the DB directly (e.g. the concurrency test)."""
    with engine.begin() as conn:
        conn.execute(text("SELECT 1"))
