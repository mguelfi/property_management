from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PermissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    code: str
    description: str


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    description: str
    permissions: list[PermissionOut]


class RoleCreate(BaseModel):
    code: str = Field(pattern=r"^[a-z][a-z0-9_]*$", max_length=50)
    name: str
    description: str = ""
    permission_codes: list[str] = []


class RoleUpdate(BaseModel):
    code: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_]*$", max_length=50)
    name: str | None = None
    description: str | None = None
    permission_codes: list[str] | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: EmailStr | None
    full_name: str
    is_active: bool
    is_superuser: bool
    roles: list[RoleOut]


class UserCreate(BaseModel):
    username: str = Field(pattern=r"^[a-zA-Z0-9_.-]{3,50}$")
    password: str = Field(min_length=8, max_length=128)
    email: EmailStr | None = None
    full_name: str = ""
    is_superuser: bool = False
    role_codes: list[str] = []


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9_.-]{3,50}$")
    email: EmailStr | None = None
    full_name: str | None = None
    is_active: bool | None = None
    is_superuser: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role_codes: list[str] | None = None


class PasswordReset(BaseModel):
    password: str | None = Field(default=None, min_length=8, max_length=128)


class PasswordResetResult(BaseModel):
    password: str | None = None
    """The generated password, present only when the caller did not supply one."""


class MeOut(BaseModel):
    id: int
    username: str
    full_name: str
    is_superuser: bool
    permissions: list[str]
