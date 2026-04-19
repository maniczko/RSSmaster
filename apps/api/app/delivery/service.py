from __future__ import annotations

from datetime import UTC, datetime
from email.message import EmailMessage
from email.utils import make_msgid
import hashlib
import logging
from pathlib import Path
import smtplib
from typing import Any

from app.config import ROOT_DIR, Settings as AppSettings
from app.errors import ApiError
from app.settings.service import (
    SettingsService,
    close_smtp_connection,
    is_valid_email,
    open_smtp_connection,
)

from .models import DeliveryDispatchMode, DeliveryTargetKind, SendDigestRequest
from .repository import DeliveryRepository

logger = logging.getLogger("rssmaster.delivery")


class DeliveryService:
    def __init__(
        self,
        settings: AppSettings,
        repository: DeliveryRepository,
        settings_service: SettingsService,
    ) -> None:
        self.settings = settings
        self.repository = repository
        self.settings_service = settings_service

    def list_logs(self, *, limit: int, digest_id: str | None) -> list[dict[str, Any]]:
        return self.repository.list_logs(limit=limit, digest_id=digest_id)

    def preflight_delivery(
        self,
        *,
        digest_id: str,
        target_kind: DeliveryTargetKind,
        recipient: str | None,
        mode: DeliveryDispatchMode,
        check_connection: bool,
    ) -> dict[str, Any]:
        digest = self._get_digest(digest_id)
        artifact = inspect_artifact(digest)

        require_kindle_email = target_kind == "kindle" and not recipient
        settings_preflight = self.settings_service.preflight_delivery_settings(
            check_connection=check_connection,
            require_kindle_email=require_kindle_email,
        )
        resolved_settings = self.settings_service.get_resolved_delivery_settings()
        resolved_recipient = resolve_recipient(
            target_kind=target_kind,
            requested_recipient=recipient,
            fallback_kindle_email=resolved_settings.kindle_email,
        )

        checks = list(settings_preflight["checks"])
        checks.append(
            {
                "name": "recipient",
                "status": "passed" if is_valid_email(resolved_recipient) else "failed",
                "message": (
                    f"Recipient {resolved_recipient} is valid."
                    if is_valid_email(resolved_recipient)
                    else "Recipient is missing or invalid."
                ),
            }
        )
        checks.append(
            {
                "name": "artifact",
                "status": "passed" if artifact["artifact_exists"] else "failed",
                "message": (
                    f"Digest artifact is ready at {artifact['artifact_path']}."
                    if artifact["artifact_exists"]
                    else "Digest artifact is missing or unreadable."
                ),
            }
        )

        failure_names = {
            check["name"]
            for check in checks
            if check["status"] == "failed"
        }
        can_send = not failure_names
        if "artifact" in failure_names:
            status = "missing_artifact"
        elif "smtp_connection" in failure_names:
            status = "connection_failed"
        elif failure_names:
            status = "needs_configuration"
        else:
            status = "ready"

        return {
            "status": status,
            "can_send": can_send,
            "mode": mode,
            "target_kind": target_kind,
            "recipient": resolved_recipient,
            "artifact": artifact,
            "checks": checks,
        }

    def dispatch_digest(self, payload: SendDigestRequest) -> dict[str, Any]:
        preflight = self.preflight_delivery(
            digest_id=payload.digest_id,
            target_kind=payload.target_kind,
            recipient=payload.recipient,
            mode=payload.mode,
            check_connection=payload.check_connection,
        )
        digest = self._get_digest(payload.digest_id)
        started_at = utc_now()
        run_scope = {
            "digest_id": payload.digest_id,
            "target_kind": payload.target_kind,
            "recipient": preflight["recipient"],
            "mode": payload.mode,
        }
        run = self.repository.create_run(scope=run_scope, trigger_kind=payload.trigger_kind)
        self.repository.mark_run_running(run["id"], started_at=started_at)

        log = self.repository.create_log(
            job_run_id=run["id"],
            digest_id=payload.digest_id,
            target_kind=payload.target_kind,
            recipient=preflight["recipient"],
            details={
                "mode": payload.mode,
                "preflight": preflight,
            },
        )

        if not preflight["can_send"]:
            details = {
                "mode": payload.mode,
                "preflight": preflight,
                "result": "preflight_failed",
            }
            self._complete_failure(
                run_id=run["id"],
                log_id=log["id"],
                started_at=started_at,
                error_code="delivery_preflight_failed",
                error_message="Delivery preflight failed.",
                details=details,
                attempt_count=0,
            )
            return {
                "run": self._get_run(run["id"]),
                "log": self._get_log(log["id"]),
                "preflight": preflight,
            }

        if payload.mode == "dry_run":
            details = {
                "mode": payload.mode,
                "preflight": preflight,
                "result": "dry_run_completed",
            }
            self._complete_success(
                run_id=run["id"],
                log_id=log["id"],
                digest_id=payload.digest_id,
                started_at=started_at,
                sent_at=None,
                provider_message_id=None,
                log_status="skipped",
                attempt_count=0,
                details=details,
            )
            return {
                "run": self._get_run(run["id"]),
                "log": self._get_log(log["id"]),
                "preflight": preflight,
            }

        try:
            provider_message_id = self._send_digest_email(
                digest=digest,
                recipient=str(preflight["recipient"]),
                subject=payload.subject,
                body_text=payload.body_text,
            )
        except (OSError, smtplib.SMTPException, RuntimeError) as error:
            logger.warning("delivery_send_failed digest_id=%s error=%s", payload.digest_id, error)
            details = {
                "mode": payload.mode,
                "preflight": preflight,
                "result": "send_failed",
            }
            self._complete_failure(
                run_id=run["id"],
                log_id=log["id"],
                started_at=started_at,
                error_code="delivery_send_failed",
                error_message=str(error),
                details=details,
                attempt_count=1,
            )
            return {
                "run": self._get_run(run["id"]),
                "log": self._get_log(log["id"]),
                "preflight": preflight,
            }

        sent_at = utc_now()
        details = {
            "mode": payload.mode,
            "preflight": preflight,
            "result": "sent",
        }
        self._complete_success(
            run_id=run["id"],
            log_id=log["id"],
            digest_id=payload.digest_id,
            started_at=started_at,
            sent_at=sent_at,
            provider_message_id=provider_message_id,
            log_status="sent",
            attempt_count=1,
            details=details,
        )
        return {
            "run": self._get_run(run["id"]),
            "log": self._get_log(log["id"]),
            "preflight": preflight,
        }

    def _send_digest_email(
        self,
        *,
        digest: dict[str, Any],
        recipient: str,
        subject: str | None,
        body_text: str | None,
    ) -> str:
        artifact = inspect_artifact(digest)
        if not artifact["artifact_exists"] or not artifact["artifact_path"]:
            raise RuntimeError("Digest artifact is missing.")

        artifact_path = Path(str(artifact["artifact_path"]))
        attachment_bytes = artifact_path.read_bytes()
        resolved_settings = self.settings_service.get_resolved_delivery_settings()
        message = EmailMessage()
        message_id = make_msgid(domain="rssmaster.local")
        message["Message-Id"] = message_id
        message["From"] = str(resolved_settings.smtp_from)
        message["To"] = recipient
        message["Subject"] = subject or str(digest["title"])
        message.set_content(
            body_text
            or f"{digest['title']}\n\nThe digest artifact is attached for Kindle delivery."
        )

        maintype, subtype = guess_mime_type(artifact_path)
        message.add_attachment(
            attachment_bytes,
            maintype=maintype,
            subtype=subtype,
            filename=artifact_path.name,
        )

        client: smtplib.SMTP | None = None
        try:
            client = open_smtp_connection(resolved_settings, timeout=15)
            client.send_message(message)
        finally:
            if client is not None:
                close_smtp_connection(client)

        return message_id

    def _complete_success(
        self,
        *,
        run_id: str,
        log_id: str,
        digest_id: str,
        started_at: str,
        sent_at: str | None,
        provider_message_id: str | None,
        log_status: str,
        attempt_count: int,
        details: dict[str, Any],
    ) -> None:
        completed_at = utc_now()
        duration_ms = elapsed_ms(started_at=started_at, completed_at=completed_at)
        self.repository.complete_log(
            log_id,
            status=log_status,
            attempt_count=attempt_count,
            provider_message_id=provider_message_id,
            sent_at=sent_at,
            error_code=None,
            error_message=None,
            details=details,
        )
        if sent_at is not None:
            self.repository.mark_digest_sent(digest_id, sent_at=sent_at)
        self.repository.complete_run(
            run_id,
            status="completed",
            completed_at=completed_at,
            duration_ms=duration_ms,
            success_count=1,
            failure_count=0,
            error_code=None,
            error_message=None,
            metadata={
                "deliveries_total": 1,
                "deliveries_sent": 1 if sent_at is not None else 0,
                "deliveries_failed": 0,
            },
        )

    def _complete_failure(
        self,
        *,
        run_id: str,
        log_id: str,
        started_at: str,
        error_code: str,
        error_message: str,
        details: dict[str, Any],
        attempt_count: int,
    ) -> None:
        completed_at = utc_now()
        duration_ms = elapsed_ms(started_at=started_at, completed_at=completed_at)
        self.repository.complete_log(
            log_id,
            status="failed",
            attempt_count=attempt_count,
            provider_message_id=None,
            sent_at=None,
            error_code=error_code,
            error_message=error_message,
            details=details,
        )
        self.repository.complete_run(
            run_id,
            status="failed",
            completed_at=completed_at,
            duration_ms=duration_ms,
            success_count=0,
            failure_count=1,
            error_code=error_code,
            error_message=error_message,
            metadata={
                "deliveries_total": 1,
                "deliveries_sent": 0,
                "deliveries_failed": 1,
            },
        )

    def _get_digest(self, digest_id: str) -> dict[str, Any]:
        digest = self.repository.get_digest(digest_id)
        if digest is None:
            raise ApiError(
                status_code=404,
                code="digest_not_found",
                message="Digest was not found.",
                details={"digest_id": digest_id},
                retryable=False,
            )
        return digest

    def _get_run(self, run_id: str) -> dict[str, Any]:
        run = self.repository.get_run(run_id)
        if run is None:
            raise RuntimeError("Delivery run disappeared after persistence.")
        return run

    def _get_log(self, log_id: str) -> dict[str, Any]:
        log = self.repository.get_log(log_id)
        if log is None:
            raise RuntimeError("Delivery log disappeared after persistence.")
        return log


def resolve_recipient(
    *,
    target_kind: DeliveryTargetKind,
    requested_recipient: str | None,
    fallback_kindle_email: str | None,
) -> str | None:
    if requested_recipient:
        return requested_recipient.lower()
    if target_kind == "kindle":
        return fallback_kindle_email.lower() if fallback_kindle_email else None
    return None


def inspect_artifact(digest: dict[str, Any]) -> dict[str, Any]:
    artifact_path = digest.get("artifact_path")
    resolved_path = resolve_artifact_path(artifact_path)
    exists = resolved_path is not None and resolved_path.exists() and resolved_path.is_file()
    artifact_bytes = resolved_path.stat().st_size if exists and resolved_path is not None else 0
    artifact_sha256 = digest.get("artifact_sha256")
    if exists and artifact_sha256 is None and resolved_path is not None:
        artifact_sha256 = hashlib.sha256(resolved_path.read_bytes()).hexdigest()

    return {
        "digest_id": digest["id"],
        "title": digest["title"],
        "status": digest["status"],
        "artifact_path": str(resolved_path) if resolved_path is not None else None,
        "artifact_exists": bool(exists),
        "artifact_bytes": artifact_bytes,
        "artifact_sha256": artifact_sha256,
        "generated_at": digest["generated_at"],
    }


def resolve_artifact_path(raw_path: object) -> Path | None:
    if raw_path is None:
        return None
    path = Path(str(raw_path))
    if not path.is_absolute():
        path = (ROOT_DIR / path).resolve()
    return path


def guess_mime_type(path: Path) -> tuple[str, str]:
    suffix = path.suffix.lower()
    if suffix == ".epub":
        return ("application", "epub+zip")
    if suffix in {".mobi", ".azw3"}:
        return ("application", "octet-stream")
    if suffix == ".pdf":
        return ("application", "pdf")
    return ("application", "octet-stream")


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def elapsed_ms(*, started_at: str, completed_at: str) -> int:
    started = datetime.fromisoformat(started_at.replace("Z", "+00:00")).astimezone(UTC)
    completed = datetime.fromisoformat(completed_at.replace("Z", "+00:00")).astimezone(UTC)
    return max(0, int((completed - started).total_seconds() * 1000))
