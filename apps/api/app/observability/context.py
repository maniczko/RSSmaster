from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
from dataclasses import dataclass, field
import uuid
from typing import Any, Iterator, Mapping

_REQUEST_ID: ContextVar[str | None] = ContextVar("rssmaster_request_id", default=None)
_RUN_ID: ContextVar[str | None] = ContextVar("rssmaster_run_id", default=None)
_CORRELATION_ID: ContextVar[str | None] = ContextVar("rssmaster_correlation_id", default=None)
_OPERATION_NAME: ContextVar[str | None] = ContextVar("rssmaster_operation_name", default=None)
_COMPONENT_NAME: ContextVar[str | None] = ContextVar("rssmaster_component_name", default=None)
_ATTEMPT_NUMBER: ContextVar[int | None] = ContextVar("rssmaster_attempt_number", default=None)
_METADATA: ContextVar[dict[str, Any] | None] = ContextVar("rssmaster_context_metadata", default=None)


@dataclass(slots=True, frozen=True)
class CorrelationContext:
    correlation_id: str
    request_id: str | None = None
    run_id: str | None = None
    operation: str | None = None
    component: str | None = None
    attempt: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def new_correlation_id(prefix: str = "corr") -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def get_request_id() -> str | None:
    return _REQUEST_ID.get()


def get_run_id() -> str | None:
    return _RUN_ID.get()


def ensure_correlation_id(prefix: str = "corr") -> str:
    correlation_id = _CORRELATION_ID.get()
    if correlation_id:
        return correlation_id

    correlation_id = _REQUEST_ID.get() or _RUN_ID.get() or new_correlation_id(prefix=prefix)
    _CORRELATION_ID.set(correlation_id)
    return correlation_id


def get_correlation_context() -> CorrelationContext:
    return CorrelationContext(
        correlation_id=ensure_correlation_id(),
        request_id=_REQUEST_ID.get(),
        run_id=_RUN_ID.get(),
        operation=_OPERATION_NAME.get(),
        component=_COMPONENT_NAME.get(),
        attempt=_ATTEMPT_NUMBER.get(),
        metadata=dict(_METADATA.get() or {}),
    )


def current_log_fields(extra: Mapping[str, Any] | None = None) -> dict[str, Any]:
    context = get_correlation_context()
    fields: dict[str, Any] = {
        "correlation_id": context.correlation_id,
        "request_id": context.request_id,
        "run_id": context.run_id,
        "operation": context.operation,
        "component": context.component,
        "attempt": context.attempt,
    }
    fields.update(context.metadata)
    if extra:
        fields.update(dict(extra))
    return {key: value for key, value in fields.items() if value is not None}


@contextmanager
def bind_correlation_context(
    *,
    request_id: str | None = None,
    run_id: str | None = None,
    correlation_id: str | None = None,
    operation: str | None = None,
    component: str | None = None,
    attempt: int | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> Iterator[CorrelationContext]:
    tokens: list[tuple[ContextVar[object], Token[object]]] = []

    def push(context_var: ContextVar[object], value: object) -> None:
        tokens.append((context_var, context_var.set(value)))

    if request_id is not None:
        push(_REQUEST_ID, request_id.strip() or None)
    if run_id is not None:
        push(_RUN_ID, run_id.strip() or None)
    if operation is not None:
        push(_OPERATION_NAME, operation.strip() or None)
    if component is not None:
        push(_COMPONENT_NAME, component.strip() or None)
    if attempt is not None:
        push(_ATTEMPT_NUMBER, attempt)

    if metadata is not None:
        merged_metadata = dict(_METADATA.get() or {})
        merged_metadata.update({key: value for key, value in metadata.items() if value is not None})
        push(_METADATA, merged_metadata)

    resolved_correlation_id = correlation_id
    if resolved_correlation_id is not None:
        resolved_correlation_id = resolved_correlation_id.strip() or None
    if resolved_correlation_id is None:
        resolved_correlation_id = _CORRELATION_ID.get() or request_id or run_id or new_correlation_id()
    push(_CORRELATION_ID, resolved_correlation_id)

    try:
        yield get_correlation_context()
    finally:
        for context_var, token in reversed(tokens):
            context_var.reset(token)


def clear_correlation_context() -> None:
    for context_var in (
        _REQUEST_ID,
        _RUN_ID,
        _CORRELATION_ID,
        _OPERATION_NAME,
        _COMPONENT_NAME,
        _ATTEMPT_NUMBER,
        _METADATA,
    ):
        context_var.set(None)
