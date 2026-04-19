from __future__ import annotations

import sys
import unittest
from pathlib import Path

from runtime_helpers import ROOT_DIR, reexec_with_venv

SCRIPT_PATH = Path(__file__).resolve()
reexec_with_venv(SCRIPT_PATH)

sys.path.insert(0, str(ROOT_DIR / "apps" / "api"))


def main() -> int:
    suite = unittest.defaultTestLoader.discover(
        start_dir=str(ROOT_DIR / "apps" / "api" / "tests"),
        top_level_dir=str(ROOT_DIR / "apps" / "api"),
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
