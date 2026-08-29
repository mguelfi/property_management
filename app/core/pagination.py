"""Offset pagination shared by list endpoints."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Annotated, TypeVar

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

T = TypeVar("T")


@dataclass(frozen=True)
class PageParams:
    limit: int
    offset: int


def page_params(
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PageParams:
    return PageParams(limit=limit, offset=offset)


class Page[T](BaseModel):
    items: Sequence[T]
    total: int
    limit: int
    offset: int


def paginate[T](
    session: Session, stmt: Select[tuple[T]], params: PageParams
) -> tuple[list[T], int]:
    total = (
        session.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    rows = list(session.scalars(stmt.limit(params.limit).offset(params.offset)))
    return rows, total
