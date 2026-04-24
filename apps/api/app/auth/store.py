from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
import shutil
import sqlite3
from uuid import uuid4

from app.db.initializer import ensure_database
from app.errors import ApiError

from .security import create_session_token, hash_password, hash_session_token, normalize_username, verify_password


class AccountsStore:
    def __init__(self, accounts_database_path: Path, legacy_workspace_path: Path, workspace_dir: Path) -> None:
        self.accounts_database_path = accounts_database_path
        self.legacy_workspace_path = legacy_workspace_path
        self.workspace_dir = workspace_dir
        self._ensure_store()

    def _connect(self) -> sqlite3.Connection:
        self.accounts_database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.accounts_database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON;")
        return connection

    def _ensure_store(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS accounts (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    normalized_username TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    workspace_database_path TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_login_at TEXT
                );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_normalized_username_unique
                    ON accounts (normalized_username);

                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                    token_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    expires_at TEXT NOT NULL,
                    revoked_at TEXT
                );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash_unique
                    ON sessions (token_hash);
                """
            )
            connection.commit()

    def has_accounts(self) -> bool:
        with self._connect() as connection:
            row = connection.execute("SELECT COUNT(*) AS total FROM accounts").fetchone()
        return bool(row and row["total"] > 0)

    def list_accounts(self) -> list[dict[str, object]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, username, display_name, created_at, last_login_at
                FROM accounts
                ORDER BY datetime(created_at) ASC, id ASC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def create_account(
        self,
        *,
        username: str,
        password: str,
        display_name: str | None,
        claim_legacy_workspace: bool,
    ) -> dict[str, object]:
        normalized_username = normalize_username(username)
        if len(normalized_username) < 3:
            raise ApiError(400, "invalid_username", "Nazwa konta musi miec co najmniej 3 znaki.")
        if len(password) < 8:
            raise ApiError(400, "invalid_password", "Haslo musi miec co najmniej 8 znakow.")

        now = datetime.now(UTC).isoformat()
        account_id = f"acct_{uuid4().hex[:12]}"
        account_display_name = (display_name or username).strip() or username.strip()
        workspace_database_path = self._build_workspace_path(normalized_username, account_id)

        with self._connect() as connection:
            existing = connection.execute(
                "SELECT id FROM accounts WHERE normalized_username = ?",
                [normalized_username],
            ).fetchone()
            if existing is not None:
                raise ApiError(409, "account_exists", "Konto o tej nazwie juz istnieje.")

            is_first_account = connection.execute("SELECT COUNT(*) AS total FROM accounts").fetchone()["total"] == 0

            try:
                if is_first_account and claim_legacy_workspace:
                    self._clone_legacy_workspace(workspace_database_path)
                else:
                    ensure_database(workspace_database_path)

                connection.execute(
                    """
                    INSERT INTO accounts (
                        id,
                        username,
                        normalized_username,
                        display_name,
                        password_hash,
                        workspace_database_path,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        account_id,
                        username.strip(),
                        normalized_username,
                        account_display_name,
                        hash_password(password),
                        str(workspace_database_path),
                        now,
                        now,
                    ],
                )
                connection.commit()
            except Exception:
                if workspace_database_path.exists():
                    workspace_database_path.unlink(missing_ok=True)
                raise

        return self.get_account(account_id)

    def authenticate(self, *, username: str, password: str) -> dict[str, object]:
        normalized_username = normalize_username(username)
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    username,
                    display_name,
                    password_hash,
                    workspace_database_path,
                    created_at,
                    last_login_at
                FROM accounts
                WHERE normalized_username = ?
                """,
                [normalized_username],
            ).fetchone()
            if row is None or not verify_password(password, str(row["password_hash"])):
                raise ApiError(401, "invalid_credentials", "Nieprawidlowy login lub haslo.")

            connection.execute(
                """
                UPDATE accounts
                SET last_login_at = ?, updated_at = ?
                WHERE id = ?
                """,
                [datetime.now(UTC).isoformat(), datetime.now(UTC).isoformat(), row["id"]],
            )
            connection.commit()

        return self.get_account(str(row["id"]))

    def create_session(self, *, account_id: str, session_days: int) -> dict[str, object]:
        raw_token = create_session_token()
        expires_at = datetime.now(UTC) + timedelta(days=session_days)
        session_id = f"ses_{uuid4().hex[:12]}"
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO sessions (id, account_id, token_hash, expires_at)
                VALUES (?, ?, ?, ?)
                """,
                [session_id, account_id, hash_session_token(raw_token), expires_at.isoformat()],
            )
            connection.commit()
        return {
            "token": raw_token,
            "expires_at": expires_at,
        }

    def resolve_session(self, token: str | None) -> dict[str, object] | None:
        if not token:
            return None

        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    a.id,
                    a.username,
                    a.display_name,
                    a.workspace_database_path,
                    a.created_at,
                    a.last_login_at,
                    s.expires_at,
                    s.revoked_at
                FROM sessions s
                INNER JOIN accounts a
                    ON a.id = s.account_id
                WHERE s.token_hash = ?
                """,
                [hash_session_token(token)],
            ).fetchone()

        if row is None:
            return None

        if row["revoked_at"] is not None:
            return None

        expires_at = datetime.fromisoformat(str(row["expires_at"]))
        if expires_at <= datetime.now(UTC):
            return None

        return {
            "id": row["id"],
            "username": row["username"],
            "display_name": row["display_name"],
            "workspace_database_path": row["workspace_database_path"],
            "created_at": row["created_at"],
            "last_login_at": row["last_login_at"],
        }

    def revoke_session(self, token: str | None) -> None:
        if not token:
            return
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE sessions
                SET revoked_at = ?
                WHERE token_hash = ?
                  AND revoked_at IS NULL
                """,
                [datetime.now(UTC).isoformat(), hash_session_token(token)],
            )
            connection.commit()

    def get_account(self, account_id: str) -> dict[str, object]:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    username,
                    display_name,
                    workspace_database_path,
                    created_at,
                    last_login_at
                FROM accounts
                WHERE id = ?
                """,
                [account_id],
            ).fetchone()
        if row is None:
            raise ApiError(404, "account_not_found", "Konto nie istnieje.")
        return dict(row)

    def build_session_payload(self, account: dict[str, object] | None) -> dict[str, object]:
        return {
            "has_accounts": self.has_accounts(),
            "auth_required": self.has_accounts(),
            "session": {"account": self._serialize_public_account(account)} if account is not None else None,
        }

    def _serialize_public_account(self, account: dict[str, object] | None) -> dict[str, object]:
        if account is None:
            raise ValueError("Account is required.")
        return {
            "id": account["id"],
            "username": account["username"],
            "display_name": account["display_name"],
            "created_at": account["created_at"],
            "last_login_at": account["last_login_at"],
        }

    def _build_workspace_path(self, normalized_username: str, account_id: str) -> Path:
        safe_username = "".join(character for character in normalized_username if character.isalnum() or character in {"-", "_"})
        safe_username = safe_username or "konto"
        return self.workspace_dir / f"{safe_username}-{account_id[-6:]}.db"

    def _clone_legacy_workspace(self, target_path: Path) -> None:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.legacy_workspace_path.exists():
            ensure_database(target_path)
            return

        if target_path.exists():
            target_path.unlink()

        source_connection = sqlite3.connect(self.legacy_workspace_path)
        target_connection = sqlite3.connect(target_path)
        try:
            source_connection.backup(target_connection)
            target_connection.commit()
        finally:
            target_connection.close()
            source_connection.close()

        # Copy sidecar WAL/SHM only when they exist and the backup path did not need them.
        for suffix in ("-wal", "-shm"):
            legacy_sidecar = Path(f"{self.legacy_workspace_path}{suffix}")
            target_sidecar = Path(f"{target_path}{suffix}")
            if legacy_sidecar.exists() and not target_sidecar.exists():
                shutil.copy2(legacy_sidecar, target_sidecar)
