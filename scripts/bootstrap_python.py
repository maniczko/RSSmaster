from __future__ import annotations

import shutil
import subprocess
import sys

from runtime_helpers import API_REQUIREMENTS_FILE, ENV_EXAMPLE_FILE, ENV_FILE, ROOT_DIR, venv_python_path


def main() -> int:
    venv_python = venv_python_path()

    if not venv_python.exists():
        print("Creating Python virtual environment...")
        subprocess.check_call([sys.executable, "-m", "venv", str(ROOT_DIR / ".venv")], cwd=ROOT_DIR)

    print("Installing backend requirements...")
    subprocess.check_call([str(venv_python), "-m", "pip", "install", "--upgrade", "pip"], cwd=ROOT_DIR)
    subprocess.check_call([str(venv_python), "-m", "pip", "install", "-r", str(API_REQUIREMENTS_FILE)], cwd=ROOT_DIR)

    if not ENV_FILE.exists() and ENV_EXAMPLE_FILE.exists():
        shutil.copyfile(ENV_EXAMPLE_FILE, ENV_FILE)
        print("Created .env from .env.example")

    print("Backend bootstrap complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

