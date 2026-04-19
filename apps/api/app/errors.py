from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.observability.context import get_correlation_context

logger = logging.getLogger("rssmaster.api")


@dataclass(slots=True)
class ApiError(Exception):
    status_code: int
    code: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)
    retryable: bool = False

    def to_dict(self) -> dict[str, Any]:
        return build_error_payload(
            code=self.code,
            message=self.message,
            details=self.details,
            retryable=self.retryable,
        )


def build_error_payload(
    *,
    code: str,
    message: str,
    details: dict[str, Any] | None,
    retryable: bool,
    request: Request | None = None,
) -> dict[str, Any]:
    context = get_correlation_context()
    resolved_details = dict(details or {})

    request_id = context.request_id
    if request_id is None and request is not None:
        request_id = getattr(request.state, "request_id", None) or request.headers.get("x-request-id")

    if context.run_id is not None and "run_id" not in resolved_details:
        resolved_details["run_id"] = context.run_id
    if context.correlation_id and "correlation_id" not in resolved_details:
        resolved_details["correlation_id"] = context.correlation_id

    return {
        "error": {
            "code": code,
            "message": message,
            "details": resolved_details,
            "retryable": retryable,
            "request_id": request_id or context.correlation_id,
        }
    }


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=build_error_payload(
            code=exc.code,
            message=exc.message,
            details=exc.details,
            retryable=exc.retryable,
            request=request,
        ),
    )


async def request_validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content=build_error_payload(
            code="validation_error",
            message="Request validation failed.",
            details={"issues": exc.errors()},
            retryable=False,
            request=request,
        ),
    )


async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled API exception", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content=build_error_payload(
            code="internal_error",
            message="Unexpected server error.",
            details={},
            retryable=False,
            request=request,
        ),
    )
