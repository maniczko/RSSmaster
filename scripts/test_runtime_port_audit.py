from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

from runtime_helpers import ROOT_DIR, reexec_with_venv

SCRIPT_PATH = Path(__file__).resolve()
reexec_with_venv(SCRIPT_PATH)

sys.path.insert(0, str(ROOT_DIR / "scripts"))

import runtime_port_audit as audit  # noqa: E402


class RuntimePortAuditTests(unittest.TestCase):
    def test_is_repo_rssmaster_listener_accepts_repo_api_runtime(self) -> None:
        listener = {
            "owner_kind": "rssmaster",
            "commandline": (
                f"{ROOT_DIR}\\.venv\\Scripts\\python.exe -m uvicorn app.main:app "
                f"--app-dir {ROOT_DIR}\\apps\\api --host 127.0.0.1 --port 8000 --reload"
            ),
        }

        self.assertTrue(audit.is_repo_rssmaster_listener("api", listener, root_dir=ROOT_DIR))

    def test_is_repo_rssmaster_listener_rejects_foreign_runtime(self) -> None:
        listener = {
            "owner_kind": "rssmaster",
            "commandline": (
                "C:\\OtherProject\\.venv\\Scripts\\python.exe -m uvicorn app.main:app "
                "--app-dir C:\\OtherProject\\apps\\api --host 127.0.0.1 --port 8000 --reload"
            ),
        }

        self.assertFalse(audit.is_repo_rssmaster_listener("api", listener, root_dir=ROOT_DIR))

    @mock.patch("runtime_port_audit.probe_json")
    @mock.patch("runtime_port_audit.get_process_details")
    @mock.patch("runtime_port_audit.get_listener_pids")
    @mock.patch("runtime_port_audit.port_in_use")
    def test_audit_runtime_port_classifies_phantom_listener(self, port_in_use: mock.Mock, get_listener_pids: mock.Mock, get_process_details: mock.Mock, probe_json: mock.Mock) -> None:
        port_in_use.return_value = True
        get_listener_pids.return_value = [4648]
        get_process_details.return_value = None
        probe_json.side_effect = [
            {"kind": "refused", "ok": False, "error": "refused"},
            {"kind": "refused", "ok": False, "error": "refused"},
        ]

        result = audit.audit_runtime_port("api", "127.0.0.1", 8000)

        self.assertEqual(result["classification"], "phantom_listener")
        self.assertEqual(result["listener_resolution"]["phantom_listener_pids"], [4648])
        self.assertEqual(result["listener_resolution"]["repo_listener_pids"], [])

    @mock.patch("runtime_port_audit.probe_json")
    @mock.patch("runtime_port_audit.is_repo_rssmaster_listener")
    @mock.patch("runtime_port_audit.get_process_details")
    @mock.patch("runtime_port_audit.get_listener_pids")
    @mock.patch("runtime_port_audit.port_in_use")
    def test_audit_runtime_port_classifies_repo_owned_stale_runtime(
        self,
        port_in_use: mock.Mock,
        get_listener_pids: mock.Mock,
        get_process_details: mock.Mock,
        is_repo_rssmaster_listener: mock.Mock,
        probe_json: mock.Mock,
    ) -> None:
        port_in_use.return_value = True
        get_listener_pids.return_value = [7976]
        get_process_details.return_value = {
            "pid": 7976,
            "process_name": "python.exe",
            "commandline": (
                f"{ROOT_DIR}\\.venv\\Scripts\\python.exe -m uvicorn app.main:app "
                f"--app-dir {ROOT_DIR}\\apps\\api --host 127.0.0.1 --port 8000 --reload"
            ),
        }
        is_repo_rssmaster_listener.return_value = True
        probe_json.side_effect = [
            {"kind": "refused", "ok": False, "error": "refused"},
            {"kind": "refused", "ok": False, "error": "refused"},
        ]

        result = audit.audit_runtime_port("api", "127.0.0.1", 8000)

        self.assertEqual(result["classification"], "stale_rssmaster")
        self.assertEqual(result["listener_resolution"]["repo_listener_pids"], [7976])
        self.assertEqual(result["listeners"][0]["owner_kind"], "repo_rssmaster")

    @mock.patch("runtime_port_audit.prepare_cold_start_cleanup")
    @mock.patch("runtime_port_audit.audit_runtime_port")
    def test_select_runtime_port_fail_fast_on_phantom_listener(self, audit_runtime_port: mock.Mock, prepare_cold_start_cleanup: mock.Mock) -> None:
        audit_runtime_port.return_value = {
            "name": "api",
            "host": "127.0.0.1",
            "port": 8000,
            "classification": "phantom_listener",
            "port_in_use": True,
            "listener_pids": [4648],
            "listeners": [],
            "probe": {"kind": "refused"},
        }

        with self.assertRaises(RuntimeError):
            audit.select_runtime_port("api", "127.0.0.1", 8000, allow_fallback=False)

        prepare_cold_start_cleanup.assert_not_called()

    @mock.patch("runtime_port_audit.wait_for_repo_listener_release")
    @mock.patch("runtime_port_audit.taskkill_tree")
    @mock.patch("runtime_port_audit.audit_runtime_port")
    def test_prepare_cold_start_cleanup_stops_repo_processes_on_default_and_fallback(
        self,
        audit_runtime_port: mock.Mock,
        taskkill_tree: mock.Mock,
        wait_for_repo_listener_release: mock.Mock,
    ) -> None:
        killed_pids: set[int] = set()

        def make_audit(port: int, classification: str, listeners: list[dict[str, object]]) -> dict[str, object]:
            return {
                "name": "api",
                "host": "127.0.0.1",
                "port": port,
                "classification": classification,
                "port_in_use": classification != "free",
                "listener_pids": [listener["pid"] for listener in listeners],
                "listeners": listeners,
                "probe": {"kind": "ok" if classification == "healthy_rssmaster" else "refused"},
            }

        default_listener = {
            "pid": 111,
            "process_name": "python.exe",
            "owner_kind": "rssmaster",
            "commandline": (
                f"{ROOT_DIR}\\.venv\\Scripts\\python.exe -m uvicorn app.main:app "
                f"--app-dir {ROOT_DIR}\\apps\\api --host 127.0.0.1 --port 8000 --reload"
            ),
        }
        fallback_listener = {
            "pid": 222,
            "process_name": "python.exe",
            "owner_kind": "rssmaster",
            "commandline": (
                f"{ROOT_DIR}\\.venv\\Scripts\\python.exe -m uvicorn app.main:app "
                f"--app-dir {ROOT_DIR}\\apps\\api --host 127.0.0.1 --port 8100 --reload"
            ),
        }

        def fake_audit_runtime_port(name: str, host: str, port: int) -> dict[str, object]:
            if port == 8000:
                if 111 in killed_pids:
                    return make_audit(port, "free", [])
                return make_audit(port, "stale_rssmaster", [default_listener])
            if port == 8100:
                if 222 in killed_pids:
                    return make_audit(port, "free", [])
                return make_audit(port, "healthy_rssmaster", [fallback_listener])
            return make_audit(port, "free", [])

        def fake_taskkill_tree(pid: int) -> None:
            killed_pids.add(pid)

        audit_runtime_port.side_effect = fake_audit_runtime_port
        taskkill_tree.side_effect = fake_taskkill_tree

        result = audit.prepare_cold_start_cleanup("api", "127.0.0.1", 8000, root_dir=ROOT_DIR)

        self.assertTrue(result["clean_start_ready"])
        cleanup = result["cleanup"]
        self.assertIsInstance(cleanup, dict)
        killed_targets = cleanup["killed_targets"]
        self.assertEqual({target["pid"] for target in killed_targets}, {111, 222})
        wait_for_repo_listener_release.assert_any_call("api", "127.0.0.1", 8000, root_dir=ROOT_DIR)
        wait_for_repo_listener_release.assert_any_call("api", "127.0.0.1", 8100, root_dir=ROOT_DIR)


def main() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(RuntimePortAuditTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
