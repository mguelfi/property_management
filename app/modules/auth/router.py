from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.pagination import Page, PageParams, page_params
from app.core.rbac import require
from app.core.security import CurrentUserDep, create_access_token

from . import service
from .models import Permission, Role, User
from .schemas import (
    MeOut,
    PasswordReset,
    PasswordResetResult,
    PermissionOut,
    RoleCreate,
    RoleOut,
    RoleUpdate,
    Token,
    UserCreate,
    UserOut,
    UserUpdate,
)

router = APIRouter()

DbDep = Annotated[Session, Depends(get_db)]
manage_users = require("auth.manage_users")
manage_roles = require("auth.manage_roles")


@router.post("/login", response_model=Token)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DbDep) -> Token:
    user = service.authenticate(db, form.username, form.password)
    return Token(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=MeOut)
def me(user: CurrentUserDep, db: DbDep) -> MeOut:
    row = db.get(User, user.id)
    return MeOut(
        id=user.id,
        username=user.username,
        full_name=row.full_name if row else "",
        is_superuser=user.is_superuser,
        permissions=sorted(user.permissions),
    )


@router.get("/permissions", response_model=list[PermissionOut], dependencies=[manage_roles])
def list_permissions(db: DbDep) -> list[Permission]:
    return list(db.scalars(select(Permission).order_by(Permission.code)))


@router.get("/roles", response_model=Page[RoleOut], dependencies=[manage_roles])
def list_roles(
    db: DbDep,
    params: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query()] = None,
) -> Page[RoleOut]:
    rows, total = service.list_roles(db, q=q, params=params)
    return Page[RoleOut](
        items=[RoleOut.model_validate(r) for r in rows],
        total=total,
        limit=params.limit,
        offset=params.offset,
    )


@router.get("/roles/{role_id}", response_model=RoleOut, dependencies=[manage_roles])
def get_role(role_id: int, db: DbDep) -> Role:
    return service.get_role_or_404(db, role_id)


@router.post("/roles", response_model=RoleOut, status_code=201, dependencies=[manage_roles])
def create_role(payload: RoleCreate, db: DbDep) -> Role:
    return service.create_role(
        db,
        code=payload.code,
        name=payload.name,
        description=payload.description,
        permission_codes=payload.permission_codes,
    )


@router.patch("/roles/{role_id}", response_model=RoleOut, dependencies=[manage_roles])
def update_role(role_id: int, payload: RoleUpdate, db: DbDep) -> Role:
    return service.update_role(db, role_id, **payload.model_dump(exclude_unset=True))


@router.delete("/roles/{role_id}", status_code=204, dependencies=[manage_roles])
def delete_role(role_id: int, db: DbDep) -> None:
    service.delete_role(db, role_id)


@router.get("/users", response_model=Page[UserOut], dependencies=[manage_users])
def list_users(
    db: DbDep,
    params: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query()] = None,
) -> Page[UserOut]:
    rows, total = service.list_users(db, q=q, params=params)
    return Page[UserOut](
        items=[UserOut.model_validate(u) for u in rows],
        total=total,
        limit=params.limit,
        offset=params.offset,
    )


@router.get("/users/{user_id}", response_model=UserOut, dependencies=[manage_users])
def get_user(user_id: int, db: DbDep) -> User:
    return service.get_user_or_404(db, user_id)


@router.post("/users", response_model=UserOut, status_code=201, dependencies=[manage_users])
def create_user(payload: UserCreate, db: DbDep) -> User:
    return service.create_user(
        db,
        username=payload.username,
        password=payload.password,
        email=payload.email,
        full_name=payload.full_name,
        is_superuser=payload.is_superuser,
        role_codes=payload.role_codes,
    )


@router.patch("/users/{user_id}", response_model=UserOut, dependencies=[manage_users])
def update_user(
    user_id: int, payload: UserUpdate, db: DbDep, actor: CurrentUserDep
) -> User:
    return service.update_user(
        db, user_id, actor_id=actor.id, **payload.model_dump(exclude_unset=True)
    )


@router.post(
    "/users/{user_id}/reset-password",
    response_model=PasswordResetResult,
    dependencies=[manage_users],
)
def reset_password(user_id: int, payload: PasswordReset, db: DbDep) -> PasswordResetResult:
    generated = service.reset_password(db, user_id, payload.password)
    return PasswordResetResult(password=generated or None)


@router.delete("/users/{user_id}", status_code=204, dependencies=[manage_users])
def deactivate_user(user_id: int, db: DbDep, actor: CurrentUserDep) -> None:
    service.deactivate_user(db, user_id, actor_id=actor.id)
