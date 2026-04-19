from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT_DIR / ".env"
ENV_EXAMPLE_FILE = ROOT_DIR / ".env.example"
API_REQUIREMENTS_FILE = ROOT_DIR / "apps" / "api" / "requirements.txt"


def venv_python_path() -> Path:
    if os.name == "nt":
        return ROOT_DIR / ".venv" / "Scripts" / "python.exe"

    return ROOT_DIR / ".venv" / "bin" / "python"


def run(command: list[str]) -> int:
    return subprocess.call(command, cwd=ROOT_DIR)


def parse_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")

    return values


def runtime_value(key: str, default: str) -> str:
    return os.environ.get(key) or parse_env_file(ENV_FILE).get(key, default)


def reexec_with_venv(script_path: Path) -> None:
    venv_python = venv_python_path()
    if not venv_python.exists():
        return

    current_python = Path(sys.executable).resolve()
    if current_python == venv_python.resolve():
        return

    raise SystemExit(
        subprocess.call(
            [str(venv_python), str(script_path), *sys.argv[1:]],
            cwd=ROOT_DIR,
        )
    )

