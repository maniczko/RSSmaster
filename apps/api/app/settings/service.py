from __future__ import annotations

from dataclasses import dataclass
from email.utils import parseaddr
import logging
import smtplib
import ssl
from typing import Any

from app.config import Settings as AppSettings

from .models import UpdateDeliverySettingsRequest
from .repository import DELIVERY_SETTINGS_DESCRIPTION, DELIVERY_SETTINGS_KEY, SettingsRepository

logger = logging.getLogger("rssmaster.settings")


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


class SettingsService:
    def __init__(self, settings: AppSettings, repository: SettingsRepository) -> None:
        self.settings = settings
        self.repository = repository

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


def is_valid_email(value: str | None) -> bool:
    if not value:
        return False
    _, parsed = parseaddr(value)
    if not parsed or "@" not in parsed:
        return False
    local_part, _, domain = parsed.rpartition("@")
    return bool(local_part and domain and "." in domain)
