from __future__ import annotations

import json
import sys
from pathlib import Path

from runtime_helpers import ROOT_DIR, reexec_with_venv

SCRIPT_PATH = Path(__file__).resolve()
reexec_with_venv(SCRIPT_PATH)

sys.path.insert(0, str(ROOT_DIR / "apps" / "api"))

try:
    from app.config import get_settings
    from app.db.initializer import ensure_database
except ModuleNotFoundError as error:
    print("Missing backend dependencies. Run `npm run bootstrap:api` first.")
    raise SystemExit(1) from error


def main() -> int:
    settings = get_settings()
    result = ensure_database(settings.database_file)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

