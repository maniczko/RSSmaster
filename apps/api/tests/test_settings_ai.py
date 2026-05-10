from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from app.config import Settings
from app.db.initializer import ensure_database
from app.settings.models import UpdateAISettingsRequest
from app.settings.repository import SettingsRepository
from app.settings.service import SettingsService


class _SuccessfulOpenAIClient:
    calls: list[tuple[str, dict[str, str]]] = []

    def __init__(self, *args, **kwargs) -> None:
        pass

    def __enter__(self) -> "_SuccessfulOpenAIClient":
        return self

    def __exit__(self, *args) -> bool:
        return False

    def get(self, url: str, headers: dict[str, str]) -> httpx.Response:
        self.calls.append((url, headers))
        return httpx.Response(200, request=httpx.Request("GET", url), json={"id": url.rsplit("/", 1)[-1]})


class _TimeoutOpenAIClient:
    def __init__(self, *args, **kwargs) -> None:
        pass

    def __enter__(self) -> "_TimeoutOpenAIClient":
        return self

    def __exit__(self, *args) -> bool:
        return False

    def get(self, url: str, headers: dict[str, str]) -> httpx.Response:
        request = httpx.Request("GET", url)
        raise httpx.TimeoutException("timeout", request=request)


def make_status_client(status_code: int):
    class _StatusOpenAIClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self) -> "_StatusOpenAIClient":
            return self

        def __exit__(self, *args) -> bool:
            return False

        def get(self, url: str, headers: dict[str, str]) -> httpx.Response:
            return httpx.Response(status_code, request=httpx.Request("GET", url), json={"error": {"message": "hidden"}})

    return _StatusOpenAIClient


class AISettingsServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.database_path = Path(self.tempdir.name) / "rssmaster.db"
        ensure_database(self.database_path)

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def _service(
        self,
        *,
        ai_enabled: bool = True,
        openai_api_key: str | None = "sk-env-secret",
        chat_model: str = "gpt-env",
        embedding_model: str = "text-embedding-env",
    ) -> SettingsService:
        settings = Settings(
            **{
                "RSSMASTER_ENV": "test",
                "RSSMASTER_DATABASE_PATH": str(self.database_path),
                "RSSMASTER_AI_ENABLED": ai_enabled,
                "RSSMASTER_OPENAI_API_KEY": openai_api_key,
                "RSSMASTER_OPENAI_CHAT_MODEL": chat_model,
                "RSSMASTER_OPENAI_EMBEDDING_MODEL": embedding_model,
            }
        )
        return SettingsService(settings, SettingsRepository(self.database_path))

    def test_env_only_ai_config_resolves_without_db_row(self) -> None:
        payload = self._service().get_ai_settings()

        self.assertTrue(payload["enabled"])
        self.assertTrue(payload["ready"])
        self.assertEqual(payload["provider"], "openai")
        self.assertEqual(payload["chat_model"], "gpt-env")
        self.assertEqual(payload["embedding_model"], "text-embedding-env")
        self.assertEqual(payload["openai_api_key"], {"configured": True, "redacted_value": "********"})
        self.assertIsNone(payload["updated_at"])

    def test_db_override_wins_over_env(self) -> None:
        service = self._service()
        payload = service.update_ai_settings(
            UpdateAISettingsRequest(
                enabled=False,
                chat_model="gpt-db",
                embedding_model="text-embedding-db",
                openai_api_key="sk-db-secret",
                updated_by="tester",
            )
        )
        resolved = service.get_resolved_ai_settings()

        self.assertFalse(payload["enabled"])
        self.assertFalse(payload["ready"])
        self.assertEqual(payload["chat_model"], "gpt-db")
        self.assertEqual(payload["embedding_model"], "text-embedding-db")
        self.assertEqual(payload["updated_by"], "tester")
        self.assertEqual(resolved.openai_api_key, "sk-db-secret")

    def test_null_openai_api_key_clears_db_value_but_allows_env_fallback(self) -> None:
        service = self._service(openai_api_key="sk-env-fallback")
        service.update_ai_settings(UpdateAISettingsRequest(openai_api_key="sk-db-secret"))

        payload = service.update_ai_settings(UpdateAISettingsRequest(openai_api_key=None))
        resolved = service.get_resolved_ai_settings()

        self.assertTrue(payload["openai_api_key"]["configured"])
        self.assertEqual(resolved.openai_api_key, "sk-env-fallback")

    def test_ai_settings_response_never_exposes_raw_secret(self) -> None:
        payload = self._service(openai_api_key="sk-super-secret").get_ai_settings()
        serialized = json.dumps(payload, ensure_ascii=False)

        self.assertNotIn("sk-super-secret", serialized)
        self.assertIn("********", serialized)

    def test_preflight_missing_key_skips_openai_network_probe(self) -> None:
        payload = self._service(openai_api_key=None).preflight_ai_settings()

        self.assertEqual(payload["status"], "needs_configuration")
        self.assertFalse(payload["can_use_ai"])
        self.assertIn("chat_model_access", {check["name"] for check in payload["checks"] if check["status"] == "skipped"})

    def test_preflight_success_uses_models_api_without_exposing_key(self) -> None:
        _SuccessfulOpenAIClient.calls = []
        service = self._service()

        with patch("app.settings.service.httpx.Client", new=_SuccessfulOpenAIClient):
            payload = service.preflight_ai_settings()

        self.assertEqual(payload["status"], "ready")
        self.assertTrue(payload["can_use_ai"])
        self.assertEqual(len(_SuccessfulOpenAIClient.calls), 2)
        self.assertTrue(all(headers["Authorization"] == "Bearer sk-env-secret" for _, headers in _SuccessfulOpenAIClient.calls))

    def test_preflight_invalid_model_is_configuration_failure(self) -> None:
        service = self._service()

        with patch("app.settings.service.httpx.Client", new=make_status_client(404)):
            payload = service.preflight_ai_settings()

        self.assertEqual(payload["status"], "needs_configuration")
        self.assertFalse(payload["can_use_ai"])
        self.assertTrue(any("nie jest dostępny" in check["message"] for check in payload["checks"]))

    def test_preflight_timeout_is_connection_failure(self) -> None:
        service = self._service()

        with patch("app.settings.service.httpx.Client", new=_TimeoutOpenAIClient):
            payload = service.preflight_ai_settings()

        self.assertEqual(payload["status"], "connection_failed")
        self.assertFalse(payload["can_use_ai"])

    def test_preflight_auth_failures_are_connection_failures(self) -> None:
        for status_code in (401, 403):
            with self.subTest(status_code=status_code):
                service = self._service()
                with patch("app.settings.service.httpx.Client", new=make_status_client(status_code)):
                    payload = service.preflight_ai_settings()

                self.assertEqual(payload["status"], "connection_failed")
                self.assertFalse(payload["can_use_ai"])
                self.assertTrue(any(str(status_code) in check["message"] for check in payload["checks"]))


if __name__ == "__main__":
    unittest.main()
