from __future__ import annotations

import base64
import hashlib
import hmac
import secrets


def normalize_username(value: str) -> str:
    return " ".join(value.strip().split()).lower()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"{base64.b64encode(salt).decode('ascii')}:{base64.b64encode(derived).decode('ascii')}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt_b64, derived_b64 = password_hash.split(":", 1)
        salt = base64.b64decode(salt_b64.encode("ascii"))
        expected = base64.b64decode(derived_b64.encode("ascii"))
    except (ValueError, TypeError):
        return False

    actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=len(expected))
    return hmac.compare_digest(actual, expected)


def create_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
