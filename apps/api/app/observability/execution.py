from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from contextlib import contextmanager
from contextvars import copy_context
from dataclasses import dataclass, field
import logging
from threading import BoundedSemaphore, Lock
from time import monotonic, sleep
from typing import Any, Callable, Iterator, TypeVar

from .context import bind_correlation_context
from .logging import log_event

T = TypeVar("T")


class ExecutionTimeoutError(TimeoutError):
    def __init__(self, operation_name: str, timeout_seconds: float) -> None:
        super().__init__(f"Operation '{operation_name}' exceeded timeout budget ({timeout_seconds}s).")
        self.operation_name = operation_name
        self.timeout_seconds = timeout_seconds


class RetryBudgetExceededError(RuntimeError):
    def __init__(self, operation_name: str, attempts: int, last_error: Exception) -> None:
        super().__init__(
            f"Operation '{operation_name}' exhausted retry budget after {attempts} attempt(s): {last_error}"
        )
        self.operation_name = operation_name
        self.attempts = attempts
        self.last_error = last_error


class ConcurrencyLimitExceededError(RuntimeError):
    def __init__(self, gate_name: str, limit: int) -> None:
        super().__init__(f"Concurrency gate '{gate_name}' is saturated at limit {limit}.")
        self.gate_name = gate_name
        self.limit = limit


@dataclass(slots=True, frozen=True)
class RetryPolicy:
    max_attempts: int = 1
    base_delay_seconds: float = 0.0
    backoff_factor: float = 2.0
    max_delay_seconds: float | None = None

    def __post_init__(self) -> None:
        if self.max_attempts <= 0:
            raise ValueError("RetryPolicy.max_attempts must be a positive integer.")
        if self.base_delay_seconds < 0:
            raise ValueError("RetryPolicy.base_delay_seconds cannot be negative.")
        if self.backoff_factor < 1:
            raise ValueError("RetryPolicy.backoff_factor must be >= 1.")
        if self.max_delay_seconds is not None and self.max_delay_seconds < 0:
            raise ValueError("RetryPolicy.max_delay_seconds cannot be negative.")

    def delay_before_attempt(self, attempt_number: int) -> float:
        if attempt_number <= 1 or self.base_delay_seconds == 0:
            return 0.0

        delay = self.base_delay_seconds * (self.backoff_factor ** max(0, attempt_number - 2))
        if self.max_delay_seconds is not None:
            delay = min(delay, self.max_delay_seconds)
        return delay


@dataclass(slots=True, frozen=True)
class ExecutionBudget:
    overall_timeout_seconds: float | None = None
    attempt_timeout_seconds: float | None = None
    retry_policy: RetryPolicy = field(default_factory=RetryPolicy)

    def __post_init__(self) -> None:
        for name, value in (
            ("overall_timeout_seconds", self.overall_timeout_seconds),
            ("attempt_timeout_seconds", self.attempt_timeout_seconds),
        ):
            if value is not None and value <= 0:
                raise ValueError(f"{name} must be a positive number when provided.")


@dataclass(slots=True, frozen=True)
class DeadlineBudget:
    started_at: float
    timeout_seconds: float

    @classmethod
    def start(cls, timeout_seconds: float | None) -> DeadlineBudget | None:
        if timeout_seconds is None:
            return None
        return cls(started_at=monotonic(), timeout_seconds=timeout_seconds)

    @property
    def deadline(self) -> float:
        return self.started_at + self.timeout_seconds

    @property
    def remaining_seconds(self) -> float:
        return max(0.0, self.deadline - monotonic())

    @property
    def expired(self) -> bool:
        return self.remaining_seconds <= 0

    def raise_if_expired(self, operation_name: str) -> None:
        if self.expired:
            raise ExecutionTimeoutError(operation_name=operation_name, timeout_seconds=self.timeout_seconds)


class ConcurrencyGate:
    def __init__(self, name: str, limit: int) -> None:
        if limit <= 0:
            raise ValueError("ConcurrencyGate.limit must be a positive integer.")

        self.name = name
        self.limit = limit
        self._semaphore = BoundedSemaphore(limit)
        self._lock = Lock()
        self._active_count = 0

    @property
    def active_count(self) -> int:
        with self._lock:
            return self._active_count

    @contextmanager
    def acquire(self, *, timeout_seconds: float | None = None) -> Iterator[None]:
        if timeout_seconds is None:
            acquired = self._semaphore.acquire()
        else:
            acquired = self._semaphore.acquire(timeout=timeout_seconds)

        if not acquired:
            raise ConcurrencyLimitExceededError(gate_name=self.name, limit=self.limit)

        with self._lock:
            self._active_count += 1

        try:
            yield
        finally:
            with self._lock:
                self._active_count = max(0, self._active_count - 1)
            self._semaphore.release()


class GateRegistry:
    def __init__(self) -> None:
        self._lock = Lock()
        self._gates: dict[str, ConcurrencyGate] = {}

    def get_gate(self, name: str, *, limit: int) -> ConcurrencyGate:
        with self._lock:
            gate = self._gates.get(name)
            if gate is None:
                gate = ConcurrencyGate(name=name, limit=limit)
                self._gates[name] = gate
                return gate

            if gate.limit != limit:
                raise ValueError(
                    f"Concurrency gate '{name}' already exists with limit {gate.limit}, not requested {limit}."
                )

            return gate


def run_with_timeout(
    func: Callable[..., T],
    *args: Any,
    timeout_seconds: float,
    operation_name: str,
    **kwargs: Any,
) -> T:
    execution_context = copy_context()

    with ThreadPoolExecutor(max_workers=1, thread_name_prefix=f"rssmaster-{operation_name}") as executor:
        future = executor.submit(execution_context.run, func, *args, **kwargs)
        try:
            return future.result(timeout=timeout_seconds)
        except FuturesTimeoutError as error:
            future.cancel()
            raise ExecutionTimeoutError(
                operation_name=operation_name,
                timeout_seconds=timeout_seconds,
            ) from error


def execute_with_budget(
    func: Callable[..., T],
    *args: Any,
    operation_name: str,
    budget: ExecutionBudget | None = None,
    logger: logging.Logger | logging.LoggerAdapter | None = None,
    request_id: str | None = None,
    run_id: str | None = None,
    component: str | None = None,
    metadata: dict[str, Any] | None = None,
    is_retryable: Callable[[Exception], bool] | None = None,
    **kwargs: Any,
) -> T:
    resolved_budget = budget or ExecutionBudget()
    deadline = DeadlineBudget.start(resolved_budget.overall_timeout_seconds)
    last_error: Exception | None = None

    for attempt in range(1, resolved_budget.retry_policy.max_attempts + 1):
        with bind_correlation_context(
            request_id=request_id,
            run_id=run_id,
            operation=operation_name,
            component=component,
            attempt=attempt,
            metadata=metadata,
        ):
            if logger is not None:
                log_event(
                    logger,
                    logging.INFO,
                    "execution_attempt_started",
                    event="execution_attempt_started",
                    operation_name=operation_name,
                    max_attempts=resolved_budget.retry_policy.max_attempts,
                )

            if deadline is not None:
                deadline.raise_if_expired(operation_name=operation_name)

            attempt_timeout = resolved_budget.attempt_timeout_seconds
            if deadline is not None:
                remaining_seconds = deadline.remaining_seconds
                if attempt_timeout is None:
                    attempt_timeout = remaining_seconds
                else:
                    attempt_timeout = min(attempt_timeout, remaining_seconds)

            try:
                if attempt_timeout is None:
                    result = func(*args, **kwargs)
                else:
                    result = run_with_timeout(
                        func,
                        *args,
                        timeout_seconds=attempt_timeout,
                        operation_name=operation_name,
                        **kwargs,
                    )
            except Exception as error:
                last_error = error
                can_retry = attempt < resolved_budget.retry_policy.max_attempts
                if can_retry and is_retryable is not None:
                    can_retry = is_retryable(error)

                if logger is not None:
                    log_event(
                        logger,
                        logging.WARNING if can_retry else logging.ERROR,
                        "execution_attempt_failed",
                        event="execution_attempt_failed",
                        operation_name=operation_name,
                        error_type=type(error).__name__,
                        error_message=str(error),
                        retry_scheduled=can_retry,
                    )

                if not can_retry:
                    if attempt > 1:
                        raise RetryBudgetExceededError(
                            operation_name=operation_name,
                            attempts=attempt,
                            last_error=error,
                        ) from error
                    raise

                delay_seconds = resolved_budget.retry_policy.delay_before_attempt(attempt + 1)
                if deadline is not None:
                    delay_seconds = min(delay_seconds, deadline.remaining_seconds)

                if delay_seconds > 0:
                    if logger is not None:
                        log_event(
                            logger,
                            logging.INFO,
                            "execution_retry_scheduled",
                            event="execution_retry_scheduled",
                            operation_name=operation_name,
                            delay_seconds=round(delay_seconds, 3),
                        )
                    sleep(delay_seconds)
                continue

            if logger is not None:
                log_event(
                    logger,
                    logging.INFO,
                    "execution_attempt_completed",
                    event="execution_attempt_completed",
                    operation_name=operation_name,
                )
            return result

    if last_error is None:  # pragma: no cover - defensive safety net
        raise RuntimeError(f"Operation '{operation_name}' exited without a result or an exception.")

    raise RetryBudgetExceededError(
        operation_name=operation_name,
        attempts=resolved_budget.retry_policy.max_attempts,
        last_error=last_error,
    ) from last_error
