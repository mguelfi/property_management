"""Domain exception types and their HTTP representations."""

from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


class PMSError(Exception):
    """Base for all business-rule errors. ``status_code`` drives the HTTP reply."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "error"

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code:
            self.code = code


class NotFound(PMSError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


class Conflict(PMSError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"


class ValidationProblem(PMSError):
    status_code = 422
    code = "validation_error"


class PermissionDenied(PMSError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "permission_denied"


class Unauthorized(PMSError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "unauthorized"


class NoAvailability(Conflict):
    code = "no_availability"


class RateClosed(Conflict):
    code = "rate_closed"


class InvalidTransition(Conflict):
    code = "invalid_transition"


class OutstandingBalance(Conflict):
    code = "outstanding_balance"


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(PMSError)
    async def _handle(_: Request, exc: PMSError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )
