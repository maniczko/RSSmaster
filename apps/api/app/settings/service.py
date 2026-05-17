from __future__ import annotations

from dataclasses import dataclass
from email.utils import parseaddr
import logging
import smtplib
import ssl
from typing import Any, Literal
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from app.config import Settings as AppSettings

from .models import (
    MagazineOutputFormat,
    MagazineScheduleFrequency,
    MagazineSourceScope,
    UpdateAISettingsRequest,
    UpdateDeliverySettingsRequest,
    UpdateMagazineSettingsRequest,
)
from .repository import (
    AI_SETTINGS_DESCRIPTION,
    AI_SETTINGS_KEY,
    DELIVERY_SETTINGS_DESCRIPTION,
    DELIVERY_SETTINGS_KEY,
    MAGAZINE_SETTINGS_DESCRIPTION,
    MAGAZINE_SETTINGS_KEY,
    SettingsRepository,
)

logger = logging.getLogger("rssmaster.settings")
OPENAI_MODELS_API_URL = "https://api.openai.com/v1/models"
OPENAI_PREFLIGHT_TIMEOUT_SECONDS = 10


@dataclass(slots=True, frozen=True)
class ResolvedDeliverySettings:
    smtp_host: str | None
    smtp_port: int
    smtp_username: str | None
    smtp_password: str | None
    smtp_from: str | None
    kindle_email: str | None
    updated_at: str | None
    updated_by: str | None

    @property
    def smtp_ready(self) -> bool:
        return self.ready_for(require_kindle_email=True)

    def ready_for(self, *, require_kindle_email: bool) -> bool:
        required_values = [self.smtp_host, self.smtp_username, self.smtp_password, self.smtp_from]
        if require_kindle_email:
            required_values.append(self.kindle_email)
        return all(bool(value) for value in required_values)


@dataclass(slots=True, frozen=True)
class ResolvedAISettings:
    enabled: bool
    provider: Literal["openai"]
    chat_model: str
    embedding_model: str
    openai_api_key: str | None
    updated_at: str | None
    updated_by: str | None

    @property
    def ready(self) -> bool:
        return (
            self.enabled
            and self.provider == "openai"
            and bool(self.chat_model)
            and bool(self.embedding_model)
            and bool(self.openai_api_key)
        )


@dataclass(slots=True, frozen=True)
class ResolvedMagazineSettings:
    frequency: MagazineScheduleFrequency
    timezone: str
    time_of_day: str
    day_of_week: int | None
    article_limit: int
    source_scope: MagazineSourceScope
    output_format: MagazineOutputFormat
    kindle_delivery_enabled: bool
    updated_at: str | None
    updated_by: str | None


class SettingsService:
    def __init__(self, settings: AppSettings, repository: SettingsRepository) -> None:
        self.settings = settings
        self.repository = repository

    def get_ai_settings(self) -> dict[str, Any]:
        resolved = self.get_resolved_ai_settings()
        checks = self._validate_ai_configuration(resolved)

        return {
            "enabled": resolved.enabled,
            "provider": resolved.provider,
            "chat_model": resolved.chat_model,
            "embedding_model": resolved.embedding_model,
            "openai_api_key": redact_secret(resolved.openai_api_key),
            "ready": resolved.ready,
            "updated_at": resolved.updated_at,
            "updated_by": resolved.updated_by,
            "issues": [
                check["message"]
                for check in checks
                if check["status"] in {"failed", "warning"}
            ],
        }

    def update_ai_settings(self, payload: UpdateAISettingsRequest) -> dict[str, Any]:
        current_record = self.repository.get_setting(AI_SETTINGS_KEY)
        current_value = dict(current_record["value"]) if current_record else {}
        next_value = dict(current_value)

        for field_name in (
            "enabled",
            "provider",
            "chat_model",
            "embedding_model",
            "openai_api_key",
        ):
            if field_name not in payload.model_fields_set:
                continue
            value = getattr(payload, field_name)
            if value is None:
                next_value.pop(field_name, None)
            else:
                next_value[field_name] = value

        if next_value:
            self.repository.upsert_setting(
                key=AI_SETTINGS_KEY,
                value=next_value,
                description=AI_SETTINGS_DESCRIPTION,
                updated_by=payload.updated_by,
            )
        else:
            self.repository.delete_setting(AI_SETTINGS_KEY)

        return self.get_ai_settings()

    def get_resolved_ai_settings(self) -> ResolvedAISettings:
        record = self.repository.get_setting(AI_SETTINGS_KEY)
        stored = dict(record["value"]) if record else {}

        return ResolvedAISettings(
            enabled=resolve_bool(stored.get("enabled"), self.settings.ai_enabled),
            provider=resolve_ai_provider(stored.get("provider"), self.settings.ai_provider),
            chat_model=normalize_text(stored.get("chat_model")) or self.settings.openai_chat_model,
            embedding_model=normalize_text(stored.get("embedding_model")) or self.settings.openai_embedding_model,
            openai_api_key=normalize_text(stored.get("openai_api_key")) or normalize_text(self.settings.openai_api_key),
            updated_at=record["updated_at"] if record else None,
            updated_by=record["updated_by"] if record else None,
        )

    def preflight_ai_settings(self) -> dict[str, Any]:
        resolved = self.get_resolved_ai_settings()
        checks = self._validate_ai_configuration(resolved)
        connection_failed = False

        if resolved.ready:
            with httpx.Client(timeout=OPENAI_PREFLIGHT_TIMEOUT_SECONDS) as client:
                chat_check, chat_connection_failed = self._probe_openai_model(
                    client=client,
                    api_key=str(resolved.openai_api_key),
                    model_id=resolved.chat_model,
                    check_name="chat_model_access",
                    label="model tekstowy",
                )
                embedding_check, embedding_connection_failed = self._probe_openai_model(
                    client=client,
                    api_key=str(resolved.openai_api_key),
                    model_id=resolved.embedding_model,
                    check_name="embedding_model_access",
                    label="model embeddingów",
                )
            checks.extend([chat_check, embedding_check])
            connection_failed = chat_connection_failed or embedding_connection_failed
        else:
            checks.extend(
                [
                    {
                        "name": "chat_model_access",
                        "status": "skipped",
                        "message": "Sprawdzenie modelu tekstowego pominięte do czasu pełnej konfiguracji AI.",
                    },
                    {
                        "name": "embedding_model_access",
                        "status": "skipped",
                        "message": "Sprawdzenie modelu embeddingów pominięte do czasu pełnej konfiguracji AI.",
                    },
                ]
            )

        failed_names = {
            check["name"]
            for check in checks
            if check["status"] == "failed"
        }
        if connection_failed:
            status = "connection_failed"
        elif failed_names:
            status = "needs_configuration"
        else:
            status = "ready"

        return {
            "status": status,
            "can_use_ai": status == "ready",
            "checks": checks,
        }

    def _validate_ai_configuration(self, resolved: ResolvedAISettings) -> list[dict[str, str]]:
        return [
            build_check(
                name="ai_enabled",
                passed=resolved.enabled,
                success_message="AI jest włączone.",
                failure_message="AI jest wyłączone.",
            ),
            build_check(
                name="ai_provider",
                passed=resolved.provider == "openai",
                success_message="Dostawca OpenAI jest wybrany.",
                failure_message="RSSmaster obsługuje teraz tylko dostawcę OpenAI.",
            ),
            build_check(
                name="openai_api_key",
                passed=bool(resolved.openai_api_key),
                success_message="Klucz OpenAI jest skonfigurowany.",
                failure_message="Brakuje klucza OpenAI.",
            ),
            build_check(
                name="chat_model",
                passed=bool(resolved.chat_model),
                success_message=f"Model tekstowy jest ustawiony: {resolved.chat_model}.",
                failure_message="Brakuje nazwy modelu tekstowego.",
            ),
            build_check(
                name="embedding_model",
                passed=bool(resolved.embedding_model),
                success_message=f"Model embeddingów jest ustawiony: {resolved.embedding_model}.",
                failure_message="Brakuje nazwy modelu embeddingów.",
            ),
        ]

    def _probe_openai_model(
        self,
        *,
        client: httpx.Client,
        api_key: str,
        model_id: str,
        check_name: str,
        label: str,
    ) -> tuple[dict[str, str], bool]:
        safe_model_id = model_id.strip()
        url = f"{OPENAI_MODELS_API_URL}/{quote(safe_model_id, safe='')}"
        headers = {"Authorization": f"Bearer {api_key}"}
        try:
            response = client.get(url, headers=headers)
        except httpx.TimeoutException:
            logger.warning("openai_model_preflight_timeout check=%s model=%s", check_name, safe_model_id)
            return (
                {
                    "name": check_name,
                    "status": "failed",
                    "message": f"Przekroczono czas sprawdzania OpenAI dla: {label}.",
                },
                True,
            )
        except httpx.RequestError as error:
            logger.warning("openai_model_preflight_request_failed check=%s model=%s error=%s", check_name, safe_model_id, error)
            return (
                {
                    "name": check_name,
                    "status": "failed",
                    "message": f"Nie udało się połączyć z OpenAI podczas sprawdzania: {label}.",
                },
                True,
            )

        if response.status_code == 200:
            return (
                {
                    "name": check_name,
                    "status": "passed",
                    "message": f"OpenAI potwierdziło dostęp do modelu {safe_model_id}.",
                },
                False,
            )

        if response.status_code in {401, 403}:
            return (
                {
                    "name": check_name,
                    "status": "failed",
                    "message": f"OpenAI odrzuciło autoryzację dla: {label} ({response.status_code}).",
                },
                True,
            )

        if response.status_code == 404:
            return (
                {
                    "name": check_name,
                    "status": "failed",
                    "message": f"Model {safe_model_id} nie jest dostępny dla tego klucza.",
                },
                False,
            )

        return (
            {
                "name": check_name,
                "status": "failed",
                "message": f"OpenAI zwróciło status {response.status_code} podczas sprawdzania: {label}.",
            },
            True,
        )

    def get_magazine_settings(self) -> dict[str, Any]:
        resolved = self.get_resolved_magazine_settings()
        preflight = self.preflight_magazine_settings()

        return {
            "frequency": resolved.frequency,
            "timezone": resolved.timezone,
            "time_of_day": resolved.time_of_day,
            "day_of_week": resolved.day_of_week,
            "article_limit": resolved.article_limit,
            "source_scope": resolved.source_scope,
            "output_format": resolved.output_format,
            "kindle_delivery_enabled": resolved.kindle_delivery_enabled,
            "ready": preflight["status"] == "ready",
            "updated_at": resolved.updated_at,
            "updated_by": resolved.updated_by,
            "issues": [
                check["message"]
                for check in preflight["checks"]
                if check["status"] in {"failed", "warning"}
            ],
        }

    def update_magazine_settings(self, payload: UpdateMagazineSettingsRequest) -> dict[str, Any]:
        current_record = self.repository.get_setting(MAGAZINE_SETTINGS_KEY)
        current_value = dict(current_record["value"]) if current_record else {}
        next_value = dict(current_value)

        for field_name in (
            "frequency",
            "timezone",
            "time_of_day",
            "day_of_week",
            "article_limit",
            "source_scope",
            "output_format",
            "kindle_delivery_enabled",
        ):
            if field_name not in payload.model_fields_set:
                continue
            value = getattr(payload, field_name)
            if value is None:
                next_value.pop(field_name, None)
            else:
                next_value[field_name] = value

        if next_value:
            self.repository.upsert_setting(
                key=MAGAZINE_SETTINGS_KEY,
                value=next_value,
                description=MAGAZINE_SETTINGS_DESCRIPTION,
                updated_by=payload.updated_by,
            )
        else:
            self.repository.delete_setting(MAGAZINE_SETTINGS_KEY)

        return self.get_magazine_settings()

    def get_resolved_magazine_settings(self) -> ResolvedMagazineSettings:
        record = self.repository.get_setting(MAGAZINE_SETTINGS_KEY)
        stored = dict(record["value"]) if record else {}

        return ResolvedMagazineSettings(
            frequency=resolve_magazine_frequency(stored.get("frequency")),
            timezone=normalize_text(stored.get("timezone")) or self.settings.timezone,
            time_of_day=resolve_time_of_day(stored.get("time_of_day"), fallback="07:00"),
            day_of_week=resolve_day_of_week(stored.get("day_of_week"), fallback=1),
            article_limit=resolve_article_limit(stored.get("article_limit"), fallback=self.settings.digest_max_items),
            source_scope=resolve_magazine_source_scope(stored.get("source_scope")),
            output_format=resolve_magazine_output_format(stored.get("output_format")),
            kindle_delivery_enabled=resolve_bool(stored.get("kindle_delivery_enabled"), False),
            updated_at=record["updated_at"] if record else None,
            updated_by=record["updated_by"] if record else None,
        )

    def preflight_magazine_settings(self) -> dict[str, Any]:
        resolved = self.get_resolved_magazine_settings()
        checks = self._validate_magazine_configuration(resolved)
        failed_names = {
            check["name"]
            for check in checks
            if check["status"] == "failed"
        }

        return {
            "status": "needs_configuration" if failed_names else "ready",
            "can_generate": not failed_names,
            "checks": checks,
        }

    def _validate_magazine_configuration(self, resolved: ResolvedMagazineSettings) -> list[dict[str, str]]:
        checks = [
            build_check(
                name="frequency",
                passed=resolved.frequency in {"manual", "daily", "weekly"},
                success_message=f"Harmonogram magazynu jest ustawiony: {resolved.frequency}.",
                failure_message="Magazyn jest wyłączony. Wybierz tryb ręczny, dzienny albo tygodniowy.",
            ),
            build_check(
                name="timezone",
                passed=is_valid_timezone(resolved.timezone),
                success_message=f"Strefa czasowa magazynu jest poprawna: {resolved.timezone}.",
                failure_message=f"Strefa czasowa magazynu jest niepoprawna: {resolved.timezone}.",
            ),
            build_check(
                name="article_limit",
                passed=1 <= resolved.article_limit <= 200,
                success_message=f"Limit artykułów jest ustawiony: {resolved.article_limit}.",
                failure_message="Limit artykułów musi być między 1 a 200.",
            ),
            build_check(
                name="source_scope",
                passed=resolved.source_scope in {"digest_candidates", "favorites", "all_active"},
                success_message=f"Zakres źródeł magazynu jest ustawiony: {resolved.source_scope}.",
                failure_message="Zakres źródeł magazynu jest niepoprawny.",
            ),
            build_check(
                name="output_format",
                passed=resolved.output_format == "epub",
                success_message="Format wyjściowy magazynu to EPUB.",
                failure_message="Magazyn obsługuje teraz tylko format EPUB.",
            ),
        ]

        if resolved.frequency in {"daily", "weekly"}:
            checks.append(
                build_check(
                    name="time_of_day",
                    passed=is_valid_time_of_day(resolved.time_of_day),
                    success_message=f"Godzina generowania jest ustawiona: {resolved.time_of_day}.",
                    failure_message="Godzina generowania musi mieć format HH:MM.",
                )
            )
        else:
            checks.append(
                {
                    "name": "time_of_day",
                    "status": "skipped",
                    "message": "Godzina generowania jest używana dopiero dla trybu dziennego lub tygodniowego.",
                }
            )

        if resolved.frequency == "weekly":
            checks.append(
                build_check(
                    name="day_of_week",
                    passed=resolved.day_of_week is not None and 1 <= resolved.day_of_week <= 7,
                    success_message=f"Dzień tygodnia jest ustawiony: {resolved.day_of_week}.",
                    failure_message="Dla tygodniowego magazynu wybierz dzień tygodnia od 1 do 7.",
                )
            )
        else:
            checks.append(
                {
                    "name": "day_of_week",
                    "status": "skipped",
                    "message": "Dzień tygodnia jest używany dopiero dla trybu tygodniowego.",
                }
            )

        if resolved.kindle_delivery_enabled:
            delivery = self.get_resolved_delivery_settings()
            checks.append(
                {
                    "name": "kindle_delivery",
                    "status": "passed" if delivery.smtp_ready else "warning",
                    "message": "Automatyczna wysyłka Kindle jest gotowa."
                    if delivery.smtp_ready
                    else "Automatyczna wysyłka Kindle wymaga kompletnej konfiguracji SMTP i adresu Kindle.",
                }
            )
        else:
            checks.append(
                {
                    "name": "kindle_delivery",
                    "status": "skipped",
                    "message": "Automatyczna wysyłka Kindle jest wyłączona dla harmonogramu magazynu.",
                }
            )

        return checks

    def get_delivery_settings(self) -> dict[str, Any]:
        resolved = self.get_resolved_delivery_settings()
        preflight = self.preflight_delivery_settings(check_connection=False)

        return {
            "smtp_host": resolved.smtp_host,
            "smtp_port": resolved.smtp_port,
            "smtp_username": resolved.smtp_username,
            "smtp_password": redact_secret(resolved.smtp_password),
            "smtp_from": resolved.smtp_from,
            "kindle_email": resolved.kindle_email,
            "smtp_ready": resolved.smtp_ready,
            "updated_at": resolved.updated_at,
            "updated_by": resolved.updated_by,
            "issues": [
                check["message"]
                for check in preflight["checks"]
                if check["status"] in {"failed", "warning"}
            ],
        }

    def update_delivery_settings(self, payload: UpdateDeliverySettingsRequest) -> dict[str, Any]:
        current_record = self.repository.get_setting(DELIVERY_SETTINGS_KEY)
        current_value = dict(current_record["value"]) if current_record else {}
        next_value = dict(current_value)

        for field_name in (
            "smtp_host",
            "smtp_port",
            "smtp_username",
            "smtp_password",
            "smtp_from",
            "kindle_email",
        ):
            if field_name not in payload.model_fields_set:
                continue
            value = getattr(payload, field_name)
            if value is None:
                next_value.pop(field_name, None)
            else:
                next_value[field_name] = value

        if next_value:
            self.repository.upsert_setting(
                key=DELIVERY_SETTINGS_KEY,
                value=next_value,
                description=DELIVERY_SETTINGS_DESCRIPTION,
                updated_by=payload.updated_by,
            )
        else:
            self.repository.delete_setting(DELIVERY_SETTINGS_KEY)

        return self.get_delivery_settings()

    def get_resolved_delivery_settings(self) -> ResolvedDeliverySettings:
        record = self.repository.get_setting(DELIVERY_SETTINGS_KEY)
        stored = dict(record["value"]) if record else {}

        return ResolvedDeliverySettings(
            smtp_host=normalize_text(stored.get("smtp_host")) or normalize_text(self.settings.smtp_host),
            smtp_port=resolve_port(stored.get("smtp_port"), self.settings.smtp_port),
            smtp_username=normalize_text(stored.get("smtp_username")) or normalize_text(self.settings.smtp_username),
            smtp_password=normalize_text(stored.get("smtp_password")) or normalize_text(self.settings.smtp_password),
            smtp_from=normalize_email(stored.get("smtp_from")) or normalize_email(self.settings.smtp_from),
            kindle_email=normalize_email(stored.get("kindle_email")) or normalize_email(self.settings.kindle_email),
            updated_at=record["updated_at"] if record else None,
            updated_by=record["updated_by"] if record else None,
        )

    def preflight_delivery_settings(
        self,
        *,
        check_connection: bool,
        require_kindle_email: bool = True,
    ) -> dict[str, Any]:
        resolved = self.get_resolved_delivery_settings()
        checks: list[dict[str, str]] = []

        checks.append(
            build_check(
                name="smtp_host",
                passed=bool(resolved.smtp_host),
                success_message="SMTP host is configured.",
                failure_message="SMTP host is missing.",
            )
        )
        checks.append(
            build_check(
                name="smtp_port",
                passed=1 <= resolved.smtp_port <= 65535,
                success_message=f"SMTP port {resolved.smtp_port} is configured.",
                failure_message="SMTP port must be between 1 and 65535.",
            )
        )
        checks.append(
            build_check(
                name="smtp_username",
                passed=bool(resolved.smtp_username),
                success_message="SMTP username is configured.",
                failure_message="SMTP username is missing.",
            )
        )
        checks.append(
            build_check(
                name="smtp_password",
                passed=bool(resolved.smtp_password),
                success_message="SMTP password is configured.",
                failure_message="SMTP password is missing.",
            )
        )
        checks.append(
            build_check(
                name="smtp_from",
                passed=is_valid_email(resolved.smtp_from),
                success_message="SMTP from address is valid.",
                failure_message="SMTP from address is missing or invalid.",
            )
        )

        if require_kindle_email:
            checks.append(
                build_check(
                    name="kindle_email",
                    passed=is_valid_email(resolved.kindle_email),
                    success_message="Kindle email is valid.",
                    failure_message="Kindle email is missing or invalid.",
                )
            )
        elif resolved.kindle_email:
            checks.append(
                build_check(
                    name="kindle_email",
                    passed=is_valid_email(resolved.kindle_email),
                    success_message="Stored Kindle email is valid.",
                    failure_message="Stored Kindle email is invalid.",
                )
            )

        smtp_connection_required = resolved.ready_for(require_kindle_email=require_kindle_email)
        if check_connection and smtp_connection_required:
            checks.append(self._probe_smtp_connection(resolved))
        else:
            checks.append(
                {
                    "name": "smtp_connection",
                    "status": "skipped",
                    "message": "SMTP connection check was not requested."
                    if not check_connection
                    else "SMTP connection check skipped until configuration is complete.",
                }
            )

        failed_names = {
            check["name"]
            for check in checks
            if check["status"] == "failed"
        }
        can_send = not failed_names
        if "smtp_connection" in failed_names:
            status = "connection_failed"
        elif failed_names:
            status = "needs_configuration"
        else:
            status = "ready"

        return {
            "status": status,
            "smtp_ready": resolved.ready_for(require_kindle_email=require_kindle_email),
            "can_send": can_send,
            "checks": checks,
        }

    def _probe_smtp_connection(self, resolved: ResolvedDeliverySettings) -> dict[str, str]:
        client: smtplib.SMTP | None = None
        try:
            client = open_smtp_connection(resolved, timeout=10)
            code, message = client.noop()
            decoded = message.decode("utf-8", errors="ignore") if isinstance(message, bytes) else str(message)
            return {
                "name": "smtp_connection",
                "status": "passed",
                "message": f"SMTP connection succeeded with NOOP {code}: {decoded}".strip(),
            }
        except (OSError, smtplib.SMTPException) as error:
            logger.warning("smtp_preflight_failed error=%s", error)
            return {
                "name": "smtp_connection",
                "status": "failed",
                "message": f"SMTP connection failed: {error}",
            }
        finally:
            if client is not None:
                close_smtp_connection(client)


def open_smtp_connection(config: ResolvedDeliverySettings, *, timeout: int) -> smtplib.SMTP:
    if not config.smtp_host:
        raise RuntimeError("SMTP host is missing.")

    client: smtplib.SMTP | None = None
    try:
        if config.smtp_port == 465:
            client = smtplib.SMTP_SSL(config.smtp_host, config.smtp_port, timeout=timeout)
            client.ehlo()
        else:
            client = smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=timeout)
            client.ehlo()
            if client.has_extn("starttls"):
                client.starttls(context=ssl.create_default_context())
                client.ehlo()

        if config.smtp_username and config.smtp_password:
            client.login(config.smtp_username, config.smtp_password)
        return client
    except Exception:
        if client is not None:
            close_smtp_connection(client)
        raise


def close_smtp_connection(client: smtplib.SMTP) -> None:
    try:
        client.quit()
    except Exception:
        client.close()


def build_check(*, name: str, passed: bool, success_message: str, failure_message: str) -> dict[str, str]:
    return {
        "name": name,
        "status": "passed" if passed else "failed",
        "message": success_message if passed else failure_message,
    }


def redact_secret(value: str | None) -> dict[str, Any]:
    if not value:
        return {"configured": False, "redacted_value": None}
    return {"configured": True, "redacted_value": "********"}


def normalize_text(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    cleaned = value.strip()
    return cleaned or None


def normalize_email(value: object) -> str | None:
    normalized = normalize_text(value)
    if normalized is None:
        return None
    return normalized.lower()


def resolve_port(value: object, fallback: int) -> int:
    if value is None:
        return fallback
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    if parsed <= 0 or parsed > 65535:
        return fallback
    return parsed


def resolve_bool(value: object, fallback: bool) -> bool:
    if value is None:
        return fallback
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return bool(value)


def resolve_ai_provider(value: object, fallback: str) -> Literal["openai"]:
    normalized = normalize_text(value) or normalize_text(fallback) or "openai"
    if normalized.lower() != "openai":
        return "openai"
    return "openai"


def resolve_magazine_frequency(value: object) -> MagazineScheduleFrequency:
    normalized = (normalize_text(value) or "disabled").lower()
    if normalized in {"manual", "daily", "weekly"}:
        return normalized  # type: ignore[return-value]
    return "disabled"


def resolve_magazine_source_scope(value: object) -> MagazineSourceScope:
    normalized = (normalize_text(value) or "digest_candidates").lower()
    if normalized in {"digest_candidates", "favorites", "all_active"}:
        return normalized  # type: ignore[return-value]
    return "digest_candidates"


def resolve_magazine_output_format(value: object) -> MagazineOutputFormat:
    normalized = (normalize_text(value) or "epub").lower()
    if normalized == "epub":
        return "epub"
    return "epub"


def resolve_time_of_day(value: object, *, fallback: str) -> str:
    normalized = normalize_text(value) or fallback
    return normalized if is_valid_time_of_day(normalized) else fallback


def resolve_day_of_week(value: object, *, fallback: int) -> int:
    try:
        parsed = int(value) if value is not None else fallback
    except (TypeError, ValueError):
        return fallback
    if parsed < 1 or parsed > 7:
        return fallback
    return parsed


def resolve_article_limit(value: object, *, fallback: int) -> int:
    try:
        parsed = int(value) if value is not None else fallback
    except (TypeError, ValueError):
        parsed = fallback
    return min(max(parsed, 1), 200)


def is_valid_time_of_day(value: str | None) -> bool:
    if not value:
        return False
    parts = value.split(":")
    if len(parts) != 2 or not all(part.isdigit() for part in parts):
        return False
    hour, minute = (int(part) for part in parts)
    return 0 <= hour <= 23 and 0 <= minute <= 59


def is_valid_timezone(value: str | None) -> bool:
    if not value:
        return False
    try:
        ZoneInfo(value)
    except ZoneInfoNotFoundError:
        return False
    return True


def is_valid_email(value: str | None) -> bool:
    if not value:
        return False
    _, parsed = parseaddr(value)
    if not parsed or "@" not in parsed:
        return False
    local_part, _, domain = parsed.rpartition("@")
    return bool(local_part and domain and "." in domain)
