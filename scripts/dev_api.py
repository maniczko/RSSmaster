from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from runtime_helpers import ROOT_DIR, reexec_with_venv, runtime_value

SCRIPT_PATH = Path(__file__).resolve()
reexec_with_venv(SCRIPT_PATH)

host = runtime_value("RSSMASTER_API_HOST", "127.0.0.1")
port = runtime_value("RSSMASTER_API_PORT", "8000")

command = [
    sys.executable,
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    str(ROOT_DIR / "apps" / "api"),
    "--host",
    host,
    "--port",
    port,
    "--reload",
    "--reload-dir",
    str(ROOT_DIR / "apps" / "api"),
]

raise SystemExit(subprocess.call(command, cwd=ROOT_DIR))

