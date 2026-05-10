from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]
ENV_FILE = ROOT_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = Field(default="rssmaster", alias="RSSMASTER_APP_NAME")
    environment: str = Field(default="development", alias="RSSMASTER_ENV")
    timezone: str = Field(default="Europe/Warsaw", alias="RSSMASTER_TIMEZONE")

    web_port: int = Field(default=3000, alias="RSSMASTER_WEB_PORT")
    api_host: str = Field(default="127.0.0.1", alias="RSSMASTER_API_HOST")
    api_port: int = Field(default=8000, alias="RSSMASTER_API_PORT")
    web_url: str = Field(default="http://127.0.0.1:3000", alias="RSSMASTER_WEB_URL")
    api_url: str = Field(default="http://127.0.0.1:8000", alias="RSSMASTER_API_URL")

    database_path: str = Field(default="./data/rssmaster.db", alias="RSSMASTER_DATABASE_PATH")
    accounts_database_path: str = Field(
        default="./data/rssmaster_accounts.db",
        alias="RSSMASTER_ACCOUNTS_DATABASE_PATH",
    )
    accounts_workspace_dir: str = Field(
        default="./data/accounts",
        alias="RSSMASTER_ACCOUNTS_WORKSPACE_DIR",
    )
    accounts_cookie_name: str = Field(
        default="rssmaster_session",
        alias="RSSMASTER_ACCOUNTS_COOKIE_NAME",
    )
    accounts_session_days: int = Field(default=30, alias="RSSMASTER_ACCOUNTS_SESSION_DAYS")
    digest_max_items: int = Field(default=25, alias="RSSMASTER_DIGEST_MAX_ITEMS")
    fetch_timeout_seconds: int = Field(default=20, alias="RSSMASTER_FETCH_TIMEOUT_SECONDS")
    sentry_dsn: str | None = Field(default=None, alias="RSSMASTER_SENTRY_DSN")
    sentry_traces_sample_rate: float = Field(default=0.1, alias="RSSMASTER_SENTRY_TRACES_SAMPLE_RATE")
    sentry_enable_logs: bool = Field(default=False, alias="RSSMASTER_SENTRY_ENABLE_LOGS")

    smtp_host: str | None = Field(default=None, alias="RSSMASTER_SMTP_HOST")
    smtp_port: int = Field(default=587, alias="RSSMASTER_SMTP_PORT")
    smtp_username: str | None = Field(default=None, alias="RSSMASTER_SMTP_USERNAME")
    smtp_password: str | None = Field(default=None, alias="RSSMASTER_SMTP_PASSWORD")
    smtp_from: str | None = Field(default=None, alias="RSSMASTER_SMTP_FROM")
    kindle_email: str | None = Field(default=None, alias="RSSMASTER_KINDLE_EMAIL")
    ai_enabled: bool = Field(default=False, alias="RSSMASTER_AI_ENABLED")
    ai_provider: str = Field(default="openai", alias="RSSMASTER_AI_PROVIDER")
    openai_api_key: str | None = Field(default=None, alias="RSSMASTER_OPENAI_API_KEY")
    openai_chat_model: str = Field(default="gpt-5.2", alias="RSSMASTER_OPENAI_CHAT_MODEL")
    openai_embedding_model: str = Field(
        default="text-embedding-3-small",
        alias="RSSMASTER_OPENAI_EMBEDDING_MODEL",
    )

    @field_validator("environment")
    @classmethod
    def validate_environment(cls, value: str) -> str:
        allowed = {"development", "test", "production"}
        normalized = value.strip().lower()

        if normalized not in allowed:
            raise ValueError(f"RSSMASTER_ENV must be one of {sorted(allowed)}, received '{value}'.")

        return normalized

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as error:
            raise ValueError(f"RSSMASTER_TIMEZONE is not a valid IANA timezone: '{value}'.") from error

        return value

    @field_validator(
        "web_port",
        "api_port",
        "smtp_port",
        "digest_max_items",
        "fetch_timeout_seconds",
        "accounts_session_days",
    )
    @classmethod
    def validate_positive_int(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("Numeric runtime settings must be positive integers.")

        return value

    @field_validator("sentry_dsn")
    @classmethod
    def normalize_optional_sentry_dsn(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("openai_api_key")
    @classmethod
    def normalize_optional_openai_api_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("ai_provider")
    @classmethod
    def validate_ai_provider(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized != "openai":
            raise ValueError("RSSMASTER_AI_PROVIDER currently supports only 'openai'.")
        return normalized

    @field_validator("openai_chat_model", "openai_embedding_model")
    @classmethod
    def validate_openai_model_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("OpenAI model settings must not be empty.")
        return cleaned

    @field_validator("sentry_traces_sample_rate")
    @classmethod
    def validate_sample_rate(cls, value: float) -> float:
        if value < 0 or value > 1:
            raise ValueError("Sentry traces sample rate must be between 0.0 and 1.0.")
        return value

    @field_validator("web_url", "api_url")
    @classmethod
    def validate_urls(cls, value: str) -> str:
        parsed = urlparse(value)

        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Runtime URLs must be absolute http(s) URLs.")

        return value.rstrip("/")

    @property
    def database_file(self) -> Path:
        database_path = Path(self.database_path)
        if database_path.is_absolute():
            return database_path

        return (ROOT_DIR / database_path).resolve()

    @property
    def accounts_database_file(self) -> Path:
        accounts_database_path = Path(self.accounts_database_path)
        if accounts_database_path.is_absolute():
            return accounts_database_path

        return (ROOT_DIR / accounts_database_path).resolve()

    @property
    def accounts_workspace_directory(self) -> Path:
        accounts_workspace_dir = Path(self.accounts_workspace_dir)
        if accounts_workspace_dir.is_absolute():
            return accounts_workspace_dir

        return (ROOT_DIR / accounts_workspace_dir).resolve()

    @property
    def smtp_ready(self) -> bool:
        required_fields = [self.smtp_host, self.smtp_username, self.smtp_password, self.smtp_from, self.kindle_email]
        return all(bool(value) for value in required_fields)

    @property
    def ai_ready(self) -> bool:
        required_fields = [self.openai_api_key, self.openai_chat_model, self.openai_embedding_model]
        return self.ai_enabled and self.ai_provider == "openai" and all(bool(value) for value in required_fields)

    def public_dict(self) -> dict[str, object]:
        return {
            "ai_enabled": self.ai_enabled,
            "ai_provider": self.ai_provider,
            "ai_ready": self.ai_ready,
            "api_host": self.api_host,
            "api_port": self.api_port,
            "api_url": self.api_url,
            "accounts_cookie_name": self.accounts_cookie_name,
            "accounts_database_path": str(self.accounts_database_file),
            "accounts_session_days": self.accounts_session_days,
            "accounts_workspace_dir": str(self.accounts_workspace_directory),
            "app_name": self.app_name,
            "database_path": str(self.database_file),
            "digest_max_items": self.digest_max_items,
            "environment": self.environment,
            "fetch_timeout_seconds": self.fetch_timeout_seconds,
            "openai_chat_model": self.openai_chat_model,
            "openai_embedding_model": self.openai_embedding_model,
            "sentry_enabled": bool(self.sentry_dsn),
            "sentry_traces_sample_rate": self.sentry_traces_sample_rate,
            "smtp_ready": self.smtp_ready,
            "timezone": self.timezone,
            "web_port": self.web_port,
            "web_url": self.web_url,
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
