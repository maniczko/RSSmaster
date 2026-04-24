from __future__ import annotations

import argparse
import json
from pathlib import Path

from runtime_helpers import ROOT_DIR, reexec_with_venv
from runtime_port_audit import (
    DEFAULT_HOST,
    DEFAULT_PORTS,
    audit_runtime_port,
    audit_runtime_ports,
    classify_default_ports,
    format_audit_summary,
    select_runtime_port,
)

SCRIPT_PATH = Path(__file__).resolve()

LOG_DIR = ROOT_DIR / "output" / "playwright"
EVIDENCE_PATH = LOG_DIR / "runtime-port-audit.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audytuje canonical porty runtime RSSmaster bez zabijania procesow.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--api-port", type=int, default=DEFAULT_PORTS["api"])
    parser.add_argument("--web-port", type=int, default=DEFAULT_PORTS["web"])
    parser.add_argument("--output", type=Path, default=EVIDENCE_PATH)
    parser.add_argument("--print-json", action="store_true", help="Wypisz pelny raport JSON na stdout.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = audit_runtime_ports(
        args.host,
        {
            "api": args.api_port,
            "web": args.web_port,
        },
    )

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")

    if args.print_json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        for name in ("api", "web"):
            audit = report["targets"][name]
            print(format_audit_summary(audit))
        print(f"evidence: {args.output}")

    return 0


if __name__ == "__main__":
    reexec_with_venv(SCRIPT_PATH)
    raise SystemExit(main())
