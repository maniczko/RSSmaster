from __future__ import annotations

from contextlib import contextmanager
from datetime import UTC, datetime
import json
import logging
from time import perf_counter
import traceback
from typing import Any, Iterator, Mapping

from .context import bind_correlation_context, current_log_fields


class StructuredLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
        }

        payload.update(current_log_fields())

        fields = getattr(record, "rssmaster_fields", None)
        if isinstance(fields, Mapping) and fields:
            payload["fields"] = {key: value for key, value in dict(fields).items() if value is not None}

        if record.exc_info:
            payload["exception"] = "".join(traceback.format_exception(*record.exc_info)).strip()

        return json.dumps(payload, ensure_ascii=True, default=str, separators=(",", ":"))


class StructuredLoggerAdapter(logging.LoggerAdapter):
    def process(self, msg: object, kwargs: dict[str, Any]) -> tuple[object, dict[str, Any]]:
        extra = dict(kwargs.get("extra") or {})
        fields = dict(self.extra)
        adapter_fields = extra.get("rssmaster_fields")
        if isinstance(adapter_fields, Mapping):
            fields.update(dict(adapter_fields))
        extra["rssmaster_fields"] = fields
        kwargs["extra"] = extra
        return msg, kwargs


def configure_structured_logger(
    name: str = "rssmaster",
    *,
    level: int = logging.INFO,
    propagate: bool = False,
) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(level)
    logger.propagate = propagate

    has_structured_handler = any(
        isinstance(getattr(handler, "formatter", None), StructuredLogFormatter) for handler in logger.handlers
    )
    if not has_structured_handler:
        handler = logging.StreamHandler()
        handler.setFormatter(StructuredLogFormatter())
        logger.addHandler(handler)

    return logger


def with_log_fields(logger: logging.Logger, **fields: Any) -> StructuredLoggerAdapter:
    return StructuredLoggerAdapter(logger, {key: value for key, value in fields.items() if value is not None})


def log_event(
    logger: logging.Logger | logging.LoggerAdapter,
    level: int,
    message: str,
    **fields: Any,
) -> None:
    logger.log(level, message, extra={"rssmaster_fields": fields})


@contextmanager
def operation_log_scope(
    logger: logging.Logger | logging.LoggerAdapter,
    *,
    operation: str,
    component: str | None = None,
    request_id: str | None = None,
    run_id: str | None = None,
    attempt: int | None = None,
    correlation_id: str | None = None,
    metadata: Mapping[str, Any] | None = None,
    start_level: int = logging.INFO,
    success_level: int = logging.INFO,
    failure_level: int = logging.ERROR,
) -> Iterator[None]:
    started_at = perf_counter()

    with bind_correlation_context(
        request_id=request_id,
        run_id=run_id,
        correlation_id=correlation_id,
        operation=operation,
        component=component,
        attempt=attempt,
        metadata=metadata,
    ):
        log_event(logger, start_level, "operation_started", event="operation_started")
        try:
            yield
        except Exception as error:
            duration_ms = max(0, int((perf_counter() - started_at) * 1000))
            log_event(
                logger,
                failure_level,
                "operation_failed",
                event="operation_failed",
                duration_ms=duration_ms,
                error_type=type(error).__name__,
                error_message=str(error),
            )
            raise
        else:
            duration_ms = max(0, int((perf_counter() - started_at) * 1000))
            log_event(
                logger,
                success_level,
                "operation_completed",
                event="operation_completed",
                duration_ms=duration_ms,
            )
