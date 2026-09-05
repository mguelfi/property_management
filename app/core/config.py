"""Application settings, loaded from environment / .env (prefix ``PMS_``)."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEFAULT_MODULES = (
    "auth",
    "inventory",
    "rates",
    "availability",
    "guests",
    "reservations",
    "frontdesk",
    "billing",
    "housekeeping",
    "reports",
    "audit",
    "webui",
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PMS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://pms:pms@localhost:5432/pms"

    host: str = "0.0.0.0"
    port: int = 8010

    secret_key: str = "dev-insecure-secret-key-change-me-in-production"
    access_token_ttl_minutes: int = 480
    jwt_algorithm: str = "HS256"

    default_currency: str = "AUD"
    default_timezone: str = "Australia/Brisbane"

    enabled_modules: Annotated[tuple[str, ...], NoDecode] = DEFAULT_MODULES

    debug: bool = False

    @field_validator("enabled_modules", mode="before")
    @classmethod
    def _split_modules(cls, v: object) -> object:
        if isinstance(v, str):
            return tuple(part.strip() for part in v.split(",") if part.strip())
        return v

    @property
    def sql_echo(self) -> bool:
        return self.debug


@lru_cache
def get_settings() -> Settings:
    return Settings()
