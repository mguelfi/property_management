from __future__ import annotations

import secrets
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound, Unauthorized, ValidationProblem
from app.core.pagination import PageParams, paginate
from app.core.security import (
    CurrentUser,
    decode_access_token,
    hash_password,
    verify_password,
)

from .models import Permission, Role, User, user_roles


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


def get_user_or_404(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise NotFound("User not found")
    return user


def get_role_or_404(session: Session, role_id: int) -> Role:
    role = session.get(Role, role_id)
    if role is None:
        raise NotFound("Role not found")
    return role


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


def _active_superuser_count(session: Session) -> int:
    return session.scalar(
        select(func.count()).select_from(User).where(
            User.is_superuser.is_(True), User.is_active.is_(True)
        )
    ) or 0


def list_users(
    session: Session, *, q: str | None, params: PageParams
) -> tuple[list[User], int]:
    stmt = select(User).order_by(User.username)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                User.username.ilike(like),
                User.full_name.ilike(like),
                User.email.ilike(like),
            )
        )
    return paginate(session, stmt, params)


def list_roles(
    session: Session, *, q: str | None, params: PageParams
) -> tuple[list[Role], int]:
    stmt = select(Role).order_by(Role.code)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Role.code.ilike(like), Role.name.ilike(like)))
    return paginate(session, stmt, params)


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


def update_user(
    session: Session, user_id: int, *, actor_id: int | None = None, **changes: Any
) -> User:
    user = get_user_or_404(session, user_id)

    if (pw := changes.pop("password", None)) is not None:
        user.hashed_password = hash_password(str(pw))
    if (roles := changes.pop("role_codes", None)) is not None:
        user.roles = _roles_by_code(session, list(roles))  # type: ignore[arg-type]

    new_username = changes.pop("username", None)
    if new_username is not None and new_username != user.username:
        clash = session.scalar(
            select(User).where(User.username == new_username, User.id != user.id)
        )
        if clash is not None:
            raise ValidationProblem("Username already taken")
        user.username = new_username

    losing_super = changes.get("is_superuser") is False and user.is_superuser
    going_inactive = changes.get("is_active") is False and user.is_active
    if losing_super and user.id == actor_id:
        raise Conflict("You cannot revoke your own administrator access")
    if (
        (losing_super or going_inactive)
        and user.is_superuser
        and user.is_active
        and _active_superuser_count(session) <= 1
    ):
        raise Conflict("Cannot remove the last active administrator")

    for field, value in changes.items():
        if value is not None:
            setattr(user, field, value)
    session.flush()
    return user


def reset_password(session: Session, user_id: int, password: str | None) -> str:
    """Set a new password. Returns the generated password when none was supplied."""
    user = get_user_or_404(session, user_id)
    generated = password is None
    pw = password or secrets.token_urlsafe(12)
    user.hashed_password = hash_password(pw)
    session.flush()
    return pw if generated else ""


def deactivate_user(session: Session, user_id: int, *, actor_id: int | None) -> User:
    user = get_user_or_404(session, user_id)
    if not user.is_active:
        return user
    if user.id == actor_id:
        raise Conflict("You cannot deactivate your own account")
    if user.is_superuser and _active_superuser_count(session) <= 1:
        raise Conflict("Cannot remove the last active administrator")
    user.is_active = False
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
    role = get_role_or_404(session, role_id)
    if (perms := changes.pop("permission_codes", None)) is not None:
        role.permissions = _permissions_by_code(session, list(perms))  # type: ignore[arg-type]
    if (new_code := changes.pop("code", None)) is not None and new_code != role.code:
        if session.scalar(select(Role).where(Role.code == new_code, Role.id != role.id)):
            raise ValidationProblem("Role code already exists")
        role.code = new_code
    for field, value in changes.items():
        if value is not None:
            setattr(role, field, value)
    session.flush()
    return role


def delete_role(session: Session, role_id: int) -> None:
    role = get_role_or_404(session, role_id)
    in_use = session.scalar(
        select(func.count()).select_from(user_roles).where(user_roles.c.role_id == role_id)
    ) or 0
    if in_use:
        raise Conflict(f"Role is assigned to {in_use} user(s)")
    session.delete(role)
    session.flush()
