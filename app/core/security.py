"""Authentication primitives + the ``current_user`` dependency.

Crypto and token handling live here (no module imports). The *resolution* of a
token into a user is provided by the ``auth`` module at startup via
:func:`set_user_resolver`, so every other module can depend on
:func:`get_current_user` without importing the auth package.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import jwt
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import PermissionDenied, Unauthorized

_pwd = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(raw: str) -> str:
    return _pwd.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return _pwd.verify(raw, hashed)


def create_access_token(subject: str, *, extra: dict[str, Any] | None = None) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_ttl_minutes),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise Unauthorized("Invalid or expired token") from exc


@dataclass(frozen=True)
class CurrentUser:
    id: int
    username: str
    permissions: frozenset[str] = field(default_factory=frozenset)
    is_superuser: bool = False

    def has(self, code: str) -> bool:
        return self.is_superuser or code in self.permissions

    def require(self, *codes: str) -> None:
        missing = [c for c in codes if not self.has(c)]
        if missing:
            raise PermissionDenied(f"Missing permission(s): {', '.join(missing)}")


UserResolver = Callable[[str, Session], CurrentUser]
_user_resolver: UserResolver | None = None


def set_user_resolver(resolver: UserResolver) -> None:
    global _user_resolver
    _user_resolver = resolver


def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    session: Annotated[Session, Depends(get_db)],
) -> CurrentUser:
    if not token:
        raise Unauthorized("Authentication required")
    if _user_resolver is None:  # pragma: no cover - misconfiguration
        raise RuntimeError("auth module not loaded: no user resolver registered")
    return _user_resolver(token, session)


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
