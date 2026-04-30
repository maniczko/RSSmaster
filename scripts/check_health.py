from __future__ import annotations

import json
from urllib.error import URLError
from socket import timeout as socket_timeout
from urllib.request import urlopen

from runtime_helpers import runtime_value

REQUEST_TIMEOUT_SECONDS = 5


def read_json(url: str) -> dict[str, object]:
    with urlopen(url, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def assert_status_ok(name: str, url: str) -> dict[str, object]:
    payload = read_json(url)
    if payload.get("status") != "ok":
        raise RuntimeError(f"{name} returned unexpected payload from {url}: {payload}")
    if name == "api":
        migration_status = payload.get("migration_status")
        if not isinstance(migration_status, dict) or migration_status.get("status") != "ready":
            raise RuntimeError(f"api health did not report migration_status.ready at {url}: {payload}")
    return payload


def assert_api_startup_ok(url: str) -> dict[str, object]:
    payload = read_json(url)
    if payload.get("status") != "ok":
        raise RuntimeError(f"api startup diagnostics were not ok at {url}: {payload}")

    startup = payload.get("startup")
    if not isinstance(startup, dict) or startup.get("database_ready") is not True:
        raise RuntimeError(f"api startup diagnostics did not report database_ready=true at {url}: {payload}")

    schema = startup.get("schema")
    if not isinstance(schema, dict):
        raise RuntimeError(f"api startup diagnostics did not report schema metadata at {url}: {payload}")
    migration_status = schema.get("migration_status")
    if not isinstance(migration_status, dict) or migration_status.get("status") != "ready":
        raise RuntimeError(f"api startup diagnostics did not report migration_status.ready at {url}: {payload}")

    return payload


def assert_web_startup_ok(url: str) -> dict[str, object]:
    payload = read_json(url)
    if payload.get("status") == "ok":
        return payload

    if payload.get("valid") is True:
        return payload

    raise RuntimeError(f"web startup diagnostics were not ok at {url}: {payload}")


def main() -> int:
    api_url = runtime_value("RSSMASTER_API_URL", "http://127.0.0.1:8000")
    web_url = runtime_value("RSSMASTER_WEB_URL", "http://127.0.0.1:3000")

    targets = {
        "api": f"{api_url.rstrip('/')}/health",
        "web": f"{web_url.rstrip('/')}/api/health",
    }
    startup_targets = {
        "api": f"{api_url.rstrip('/')}/diagnostics/startup",
        "web": f"{web_url.rstrip('/')}/api/diagnostics/startup",
    }

    for name, url in targets.items():
        try:
            payload = assert_status_ok(name, url)
        except (socket_timeout, TimeoutError, URLError, OSError, RuntimeError) as error:
            print(
                f"{name}: could not verify {url} within {REQUEST_TIMEOUT_SECONDS}s. "
                f"If the {name} runtime is already bound but unresponsive, restart it and remove any stale listener "
                "before retrying. "
                f"({error})"
            )
            return 1

        print(f"{name}: {payload}")

    for name, url in startup_targets.items():
        try:
            if name == "api":
                payload = assert_api_startup_ok(url)
            else:
                payload = assert_web_startup_ok(url)
        except (socket_timeout, TimeoutError, URLError, OSError, RuntimeError) as error:
            print(
                f"{name} startup: could not verify {url} within {REQUEST_TIMEOUT_SECONDS}s. "
                f"({error})"
            )
            return 1

        print(f"{name} startup: {payload}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
