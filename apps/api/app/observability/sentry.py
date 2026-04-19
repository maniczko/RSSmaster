from __future__ import annotations

from typing import Any

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from app.config import Settings


def build_sentry_options(settings: Settings) -> dict[str, Any] | None:
    if not settings.sentry_dsn:
        return None

    return {
        "dsn": settings.sentry_dsn,
        "environment": settings.environment,
        "traces_sample_rate": settings.sentry_traces_sample_rate,
        "send_default_pii": False,
        "enable_logs": settings.sentry_enable_logs,
        "integrations": [
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
    }


def initialize_sentry(settings: Settings) -> bool:
    options = build_sentry_options(settings)
    if options is None:
        return False

    sentry_sdk.init(**options)
    return True
