from __future__ import annotations

import json
from urllib.request import urlopen
from urllib.error import URLError

from runtime_helpers import runtime_value


def read_json(url: str) -> dict[str, object]:
    with urlopen(url) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    api_url = runtime_value("RSSMASTER_API_URL", "http://127.0.0.1:8000")
    web_url = runtime_value("RSSMASTER_WEB_URL", "http://127.0.0.1:3000")

    targets = {
        "api": f"{api_url.rstrip('/')}/health",
        "web": f"{web_url.rstrip('/')}/api/health",
    }

    for name, url in targets.items():
        try:
            payload = read_json(url)
        except URLError as error:
            print(f"{name}: could not reach {url}. Start the services with `npm run dev` first. ({error})")
            return 1

        print(f"{name}: {payload}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
