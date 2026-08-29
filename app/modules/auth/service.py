from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFound, Unauthorized, ValidationProblem
from app.core.security import (
    CurrentUser,
    decode_access_token,
    hash_password,
    verify_password,
)

from .models import Permission, Role, User


def authenticate(session: Session, username: str, password: str) -> User:
    user = session.scalar(select(User).where(User.username == username))
    if user is None or not verify_password(password, user.hashed_password):
        raise Unauthorized("Incorrect username or password")
    if not user.is_active:
        raise Unauthorized("Account is disabled")
    return user


def resolve_user(token: str, session: Session) -> CurrentUser:
    """Registered as the core user resolver (see module ``on_startup``)."""
    payload = decode_access_token(token)
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise Unauthorized("Malformed token") from exc
    user = session.get(User, user_id)
    if user is None or not user.is_active:
        raise Unauthorized("User no longer valid")
    return CurrentUser(
        id=user.id,
        username=user.username,
        permissions=frozenset(user.permission_codes),
        is_superuser=user.is_superuser,
    )


def _roles_by_code(session: Session, codes: list[str]) -> list[Role]:
    if not codes:
        return []
    roles = list(session.scalars(select(Role).where(Role.code.in_(codes))))
    found = {r.code for r in roles}
    missing = set(codes) - found
    if missing:
        raise ValidationProblem(f"Unknown role(s): {', '.join(sorted(missing))}")
    return roles


def _permissions_by_code(session: Session, codes: list[str]) -> list[Permission]:
    if not codes:
        return []
    perms = list(session.scalars(select(Permission).where(Permission.code.in_(codes))))
    missing = set(codes) - {p.code for p in perms}
    if missing:
        raise ValidationProblem(f"Unknown permission(s): {', '.join(sorted(missing))}")
    return perms


def create_user(
    session: Session,
    *,
    username: str,
    password: str,
    email: str | None,
    full_name: str,
    is_superuser: bool,
    role_codes: list[str],
) -> User:
    if session.scalar(select(User).where(User.username == username)):
        raise ValidationProblem("Username already taken")
    user = User(
        username=username,
        email=email,
        full_name=full_name,
        hashed_password=hash_password(password),
        is_superuser=is_superuser,
        roles=_roles_by_code(session, role_codes),
    )
    session.add(user)
    session.flush()
    return user


def update_user(session: Session, user_id: int, **changes: Any) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise NotFound("User not found")
    if (pw := changes.pop("password", None)) is not None:
        user.hashed_password = hash_password(str(pw))
    if (roles := changes.pop("role_codes", None)) is not None:
        user.roles = _roles_by_code(session, list(roles))  # type: ignore[arg-type]
    for field, value in changes.items():
        if value is not None:
            setattr(user, field, value)
    session.flush()
    return user


def create_role(
    session: Session, *, code: str, name: str, description: str, permission_codes: list[str]
) -> Role:
    if session.scalar(select(Role).where(Role.code == code)):
        raise ValidationProblem("Role code already exists")
    role = Role(
        code=code,
        name=name,
        description=description,
        permissions=_permissions_by_code(session, permission_codes),
    )
    session.add(role)
    session.flush()
    return role


def update_role(session: Session, role_id: int, **changes: Any) -> Role:
    role = session.get(Role, role_id)
    if role is None:
        raise NotFound("Role not found")
    if (perms := changes.pop("permission_codes", None)) is not None:
        role.permissions = _permissions_by_code(session, list(perms))  # type: ignore[arg-type]
    for field, value in changes.items():
        if value is not None:
            setattr(role, field, value)
    session.flush()
    return role
