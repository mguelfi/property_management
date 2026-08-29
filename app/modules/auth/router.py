from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rbac import require
from app.core.security import CurrentUserDep, create_access_token

from . import service
from .models import Permission, Role, User
from .schemas import (
    MeOut,
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


@router.get("/roles", response_model=list[RoleOut], dependencies=[manage_roles])
def list_roles(db: DbDep) -> list[Role]:
    return list(db.scalars(select(Role).order_by(Role.code)))


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


@router.get("/users", response_model=list[UserOut], dependencies=[manage_users])
def list_users(db: DbDep) -> list[User]:
    return list(db.scalars(select(User).order_by(User.username)))


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
def update_user(user_id: int, payload: UserUpdate, db: DbDep) -> User:
    return service.update_user(db, user_id, **payload.model_dump(exclude_unset=True))
