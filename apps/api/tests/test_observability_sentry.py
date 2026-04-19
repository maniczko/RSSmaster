from __future__ import annotations

import unittest

from app.config import Settings
from app.observability.sentry import build_sentry_options
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration


class SentryOptionsTests(unittest.TestCase):
    def test_returns_none_when_dsn_is_missing(self) -> None:
        settings = Settings(_env_file=None, RSSMASTER_SENTRY_DSN="")

        self.assertIsNone(build_sentry_options(settings))

    def test_builds_fastapi_and_starlette_integrations(self) -> None:
        settings = Settings(
            _env_file=None,
            RSSMASTER_SENTRY_DSN="https://public@example.ingest.sentry.io/1",
            RSSMASTER_SENTRY_TRACES_SAMPLE_RATE=0.25,
            RSSMASTER_SENTRY_ENABLE_LOGS="true",
        )

        options = build_sentry_options(settings)

        self.assertIsNotNone(options)
        assert options is not None
        self.assertEqual(options["dsn"], "https://public@example.ingest.sentry.io/1")
        self.assertEqual(options["environment"], settings.environment)
        self.assertEqual(options["traces_sample_rate"], 0.25)
        self.assertTrue(options["enable_logs"])
        self.assertFalse(options["send_default_pii"])
        integration_types = {type(entry) for entry in options["integrations"]}
        self.assertEqual(integration_types, {StarletteIntegration, FastApiIntegration})
