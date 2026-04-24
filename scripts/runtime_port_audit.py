from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import json
import os
import re
from pathlib import Path
import socket
import subprocess
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

REQUEST_TIMEOUT_SECONDS = 5
WAIT_TIMEOUT_SECONDS = 30
DEFAULT_HOST = "127.0.0.1"
DEFAULT_WEB_PORT = 3000
DEFAULT_API_PORT = 8000
DEFAULT_PORTS = {
    "web": DEFAULT_WEB_PORT,
    "api": DEFAULT_API_PORT,
}
FALLBACK_OFFSETS = (100, 200, 300, 301, 302)


def runtime_health_url(name: str, host: str, port: int) -> str:
    return f"http://{host}:{port}/health" if name == "api" else f"http://{host}:{port}/api/health"


def runtime_startup_url(name: str, host: str, port: int) -> str:
    return f"http://{host}:{port}/diagnostics/startup" if name == "api" else f"http://{host}:{port}/api/diagnostics/startup"


def read_json(url: str, timeout_seconds: int = REQUEST_TIMEOUT_SECONDS) -> dict[str, object]:
    with urlopen(url, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


def _is_timeout_reason(reason: object) -> bool:
    return isinstance(reason, (TimeoutError, socket.timeout))


def _is_refused_reason(reason: object) -> bool:
    if isinstance(reason, ConnectionRefusedError):
        return True
    if isinstance(reason, OSError) and getattr(reason, "winerror", None) == 10061:
        return True
    return False


def probe_json(url: str, timeout_seconds: int = REQUEST_TIMEOUT_SECONDS) -> dict[str, object]:
    try:
        payload = read_json(url, timeout_seconds=timeout_seconds)
    except HTTPError as error:
        return {
            "kind": "http_error",
            "ok": False,
            "error": str(error),
            "status_code": error.code,
        }
    except URLError as error:
        reason = getattr(error, "reason", None)
        if _is_timeout_reason(reason):
            return {"kind": "timeout", "ok": False, "error": str(error)}
        if _is_refused_reason(reason):
            return {"kind": "refused", "ok": False, "error": str(error)}
        return {"kind": "url_error", "ok": False, "error": str(error)}
    except (TimeoutError, socket.timeout) as error:
        return {"kind": "timeout", "ok": False, "error": str(error)}
    except OSError as error:
        if _is_refused_reason(error):
            return {"kind": "refused", "ok": False, "error": str(error)}
        return {"kind": "os_error", "ok": False, "error": str(error)}

    status = payload.get("status")
    valid = payload.get("valid")
    ok = status == "ok" or valid is True
    return {
        "kind": "ok" if ok else "invalid_payload",
        "ok": ok,
        "payload": payload,
    }


def port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.5)
        return probe.connect_ex((host, port)) == 0


def get_listener_pids(port: int) -> list[int]:
    if os.name != "nt":
        return []

    pids: set[int] = set()

    powershell = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            f"(Get-NetTCPConnection -LocalPort {port} -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    for raw in powershell.stdout.splitlines():
        candidate = raw.strip()
        if candidate.isdigit():
            pids.add(int(candidate))

    netstat = subprocess.run(
        ["netstat", "-ano", "-p", "TCP"],
        capture_output=True,
        text=True,
        check=False,
    )
    port_pattern = re.compile(rf"^(TCP|UDP)\s+\S+:{port}\s+\S+\s+LISTENING\s+(\d+)$", re.IGNORECASE)
    for raw in netstat.stdout.splitlines():
        match = port_pattern.match(raw.strip())
        if match:
            pids.add(int(match.group(2)))

    return sorted(pids)


def get_process_details(pid: int) -> dict[str, object] | None:
    if os.name != "nt":
        return None

    completed = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            (
                f"$proc = Get-CimInstance Win32_Process -Filter \"ProcessId = {pid}\"; "
                "if ($proc) { $proc | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress }"
            ),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    raw = completed.stdout.strip()
    if not raw:
        return None

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None

    if isinstance(payload, list):
        payload = payload[0] if payload else {}

    if not isinstance(payload, dict):
        return None

    return {
        "pid": int(payload.get("ProcessId", pid)),
        "process_name": payload.get("Name"),
        "commandline": payload.get("CommandLine"),
    }


def taskkill_tree(pid: int) -> None:
    subprocess.run(
        ["taskkill", "/PID", str(pid), "/T", "/F"],
        capture_output=True,
        text=True,
        check=False,
    )


def infer_listener_owner(name: str, commandline: str | None) -> str:
    if not commandline:
        return "unknown"

    normalized = commandline.lower()
    if "rssmaster" not in normalized:
        return "non_rssmaster"

    if name == "api":
        if "uvicorn" in normalized or "app.main:app" in normalized or "dev_api.py" in normalized:
            return "rssmaster"
        return "unknown"

    if "run_web.mjs" in normalized or "next" in normalized:
        return "rssmaster"
    return "unknown"


def normalize_commandline(commandline: str | None) -> str:
    if not isinstance(commandline, str):
        return ""
    return commandline.lower().replace("/", "\\")


def repo_runtime_marker(root_dir: str | Path | None = None) -> str:
    resolved = Path(root_dir) if root_dir is not None else Path(__file__).resolve().parents[1]
    return str(resolved).lower().replace("/", "\\")


def is_repo_rssmaster_listener(
    name: str,
    listener: dict[str, object],
    *,
    root_dir: str | Path | None = None,
) -> bool:
    normalized = normalize_commandline(listener.get("commandline") if isinstance(listener.get("commandline"), str) else None)
    if not normalized:
        return False

    owner_kind = str(listener.get("owner_kind") or "")
    if owner_kind != "rssmaster":
        inferred_kind = infer_listener_owner(name, listener.get("commandline") if isinstance(listener.get("commandline"), str) else None)
        if inferred_kind != "rssmaster":
            return False

    if repo_runtime_marker(root_dir) not in normalized:
        return False

    if name == "api":
        return "uvicorn" in normalized or "app.main:app" in normalized or "dev_api.py" in normalized

    return "next" in normalized or "run_web.mjs" in normalized or "start-server.js" in normalized


def classify_port_state(*, port_in_use_value: bool, listener_owner_kinds: set[str], probe_kind: str) -> str:
    if "repo_rssmaster" in listener_owner_kinds:
        if probe_kind == "ok":
            return "healthy_rssmaster"
        return "stale_rssmaster"

    if "foreign_rssmaster" in listener_owner_kinds or "foreign" in listener_owner_kinds:
        if probe_kind == "timeout":
            return "timeout"
        return "blocked_non_rssmaster"

    if "phantom" in listener_owner_kinds:
        if probe_kind == "ok":
            return "healthy_unknown"
        if port_in_use_value:
            return "phantom_listener"
        return "free"

    if port_in_use_value:
        if probe_kind == "refused":
            return "refused"
        if probe_kind == "timeout":
            return "timeout"
        return "blocked_non_rssmaster"

    if probe_kind == "timeout":
        return "timeout"
    return "free"


def audit_runtime_port(name: str, host: str, port: int) -> dict[str, object]:
    health_url = runtime_health_url(name, host, port)
    startup_url = runtime_startup_url(name, host, port)
    listener_pids = get_listener_pids(port)
    socket_port_in_use = port_in_use(host, port)
    port_in_use_value = socket_port_in_use or bool(listener_pids)
    listeners: list[dict[str, object]] = []
    owner_kinds: set[str] = set()
    repo_listener_pids: list[int] = []
    foreign_listener_pids: list[int] = []
    phantom_listener_pids: list[int] = []

    for pid in listener_pids:
        details = get_process_details(pid) or {"pid": pid, "process_name": None, "commandline": None}
        commandline = details.get("commandline") if isinstance(details, dict) else None
        inferred_kind = infer_listener_owner(name, commandline if isinstance(commandline, str) else None)
        if not isinstance(details, dict) or not details.get("commandline"):
            listener_kind = "phantom"
            phantom_listener_pids.append(pid)
        elif inferred_kind == "rssmaster" and is_repo_rssmaster_listener(name, details, root_dir=Path(__file__).resolve().parents[1]):
            listener_kind = "repo_rssmaster"
            repo_listener_pids.append(pid)
        elif inferred_kind == "rssmaster":
            listener_kind = "foreign_rssmaster"
            foreign_listener_pids.append(pid)
        elif inferred_kind == "non_rssmaster":
            listener_kind = "foreign"
            foreign_listener_pids.append(pid)
        else:
            listener_kind = "phantom"
            phantom_listener_pids.append(pid)
        owner_kinds.add(listener_kind)
        listeners.append(
            {
                "pid": pid,
                "process_name": details.get("process_name") if isinstance(details, dict) else None,
                "commandline": commandline if isinstance(commandline, str) else None,
                "owner_kind": listener_kind,
                "inferred_kind": inferred_kind,
                "repo_owned": listener_kind == "repo_rssmaster",
            }
        )

    probe = probe_json(health_url)
    classification = classify_port_state(
        port_in_use_value=port_in_use_value,
        listener_owner_kinds=owner_kinds,
        probe_kind=str(probe.get("kind")),
    )
    listener_resolution = {
        "repo_listener_pids": repo_listener_pids,
        "foreign_listener_pids": foreign_listener_pids,
        "phantom_listener_pids": phantom_listener_pids,
        "mixed": bool(repo_listener_pids and (foreign_listener_pids or phantom_listener_pids)),
    }
    startup_probe = probe_json(startup_url)

    return {
        "name": name,
        "host": host,
        "port": port,
        "health_url": health_url,
        "startup_url": startup_url,
        "port_in_use": port_in_use_value,
        "socket_port_in_use": socket_port_in_use,
        "listener_pids": listener_pids,
        "listeners": listeners,
        "listener_resolution": listener_resolution,
        "probe": probe,
        "startup_probe": startup_probe,
        "classification": classification,
        "audited_at": datetime.now(UTC).isoformat(),
    }


def audit_runtime_ports(host: str = DEFAULT_HOST, ports: dict[str, int] | None = None) -> dict[str, object]:
    selected_ports = ports or DEFAULT_PORTS
    targets = {name: audit_runtime_port(name, host, port) for name, port in selected_ports.items()}
    return {
        "audited_at": datetime.now(UTC).isoformat(),
        "host": host,
        "targets": targets,
        "summary": {name: target["classification"] for name, target in targets.items()},
    }


def wait_for_repo_listener_release(
    name: str,
    host: str,
    port: int,
    *,
    root_dir: str | Path | None = None,
    timeout_seconds: int = WAIT_TIMEOUT_SECONDS,
) -> None:
    deadline = datetime.now(UTC).timestamp() + timeout_seconds
    while datetime.now(UTC).timestamp() < deadline:
        audit = audit_runtime_port(name, host, port)
        listeners = audit.get("listeners")
        repo_listener_present = False
        if isinstance(listeners, list):
            for raw_listener in listeners:
                if isinstance(raw_listener, dict) and is_repo_rssmaster_listener(name, raw_listener, root_dir=root_dir):
                    repo_listener_present = True
                    break
        if not repo_listener_present:
            return
        time.sleep(1)
    raise RuntimeError(f"Repo runtime listeners on {host}:{port} were still present after {timeout_seconds}s.")


def collect_repo_cleanup_targets(
    name: str,
    host: str,
    ports: list[int],
    *,
    root_dir: str | Path | None = None,
) -> dict[str, object]:
    audits: dict[int, dict[str, object]] = {}
    targets: list[dict[str, object]] = []
    seen_pids: set[int] = set()

    for port in ports:
        audit = audit_runtime_port(name, host, port)
        audits[port] = audit
        listeners = audit.get("listeners")
        if not isinstance(listeners, list):
            continue

        for raw_listener in listeners:
            if not isinstance(raw_listener, dict):
                continue
            if not is_repo_rssmaster_listener(name, raw_listener, root_dir=root_dir):
                continue
            pid = raw_listener.get("pid")
            if not isinstance(pid, int) or pid in seen_pids:
                continue
            seen_pids.add(pid)
            targets.append(
                {
                    "pid": pid,
                    "port": port,
                    "process_name": raw_listener.get("process_name"),
                    "commandline": raw_listener.get("commandline"),
                    "owner_kind": raw_listener.get("owner_kind"),
                    "classification": audit.get("classification"),
                }
            )

    return {
        "ports": ports,
        "audits": audits,
        "targets": targets,
    }


def cleanup_repo_runtimes(
    name: str,
    host: str,
    ports: list[int],
    *,
    root_dir: str | Path | None = None,
) -> dict[str, object]:
    collected = collect_repo_cleanup_targets(name, host, ports, root_dir=root_dir)
    targets = collected["targets"] if isinstance(collected, dict) else []
    before_audits = collected["audits"] if isinstance(collected, dict) else {}
    killed_targets: list[dict[str, object]] = []

    for target in targets:
        if not isinstance(target, dict):
            continue
        pid = target.get("pid")
        if not isinstance(pid, int):
            continue
        taskkill_tree(pid)
        killed_targets.append(target)

    if killed_targets:
        released_ports = sorted({int(target["port"]) for target in killed_targets if isinstance(target, dict) and isinstance(target.get("port"), int)})
        for port in released_ports:
            wait_for_repo_listener_release(name, host, port, root_dir=root_dir)

    after_audits = {port: audit_runtime_port(name, host, port) for port in ports}
    return {
        "ports": ports,
        "before_audits": before_audits,
        "after_audits": after_audits,
        "killed_targets": killed_targets,
    }


def prepare_cold_start_cleanup(
    name: str,
    host: str,
    preferred_port: int,
    *,
    root_dir: str | Path | None = None,
) -> dict[str, object]:
    scope_ports = [preferred_port, *fallback_ports(preferred_port)]
    cleanup = cleanup_repo_runtimes(name, host, scope_ports, root_dir=root_dir)
    after_audits = cleanup.get("after_audits") if isinstance(cleanup, dict) else {}
    preferred_after = after_audits.get(preferred_port) if isinstance(after_audits, dict) else None

    if not isinstance(preferred_after, dict):
        raise RuntimeError(f"Missing post-cleanup audit for {name} on {host}:{preferred_port}.")

    clean_start_ready = str(preferred_after.get("classification")) == "free"
    return {
        "name": name,
        "host": host,
        "preferred_port": preferred_port,
        "scope_ports": scope_ports,
        "cleanup": cleanup,
        "preferred_audit_after_cleanup": preferred_after,
        "clean_start_ready": clean_start_ready,
        "blocker_message": None if clean_start_ready else cold_start_blocker_message(name, host, preferred_port, preferred_after),
    }


def fallback_ports(preferred_port: int) -> list[int]:
    return [preferred_port + offset for offset in FALLBACK_OFFSETS]


def _build_fallback_reason(name: str, preferred_audit: dict[str, object], chosen_port: int, selection_reason: str) -> str | None:
    preferred_port = int(preferred_audit["port"])
    preferred_classification = str(preferred_audit["classification"])
    if chosen_port == preferred_port:
        return None

    if selection_reason.startswith("fallback_existing_healthy"):
        return (
            f"requested {name} port {preferred_port} had classification {preferred_classification}, "
            f"so existing healthy fallback {chosen_port} was reused"
        )

    return (
        f"requested {name} port {preferred_port} had classification {preferred_classification}, "
        f"so free fallback {chosen_port} was selected"
    )


def _format_listener_summary(listeners: list[dict[str, object]]) -> str:
    if not listeners:
        return "no listeners were identified"

    chunks: list[str] = []
    for listener in listeners:
        pid = listener.get("pid")
        process_name = listener.get("process_name") or "unknown"
        owner_kind = listener.get("owner_kind") or "unknown"
        commandline = listener.get("commandline") or ""
        trimmed_command = str(commandline).strip()
        if len(trimmed_command) > 140:
            trimmed_command = f"{trimmed_command[:137]}..."
        if trimmed_command:
            chunks.append(f"pid={pid} {process_name} owner={owner_kind} cmd={trimmed_command}")
        else:
            chunks.append(f"pid={pid} {process_name} owner={owner_kind}")
    return "; ".join(chunks)


def cold_start_blocker_message(name: str, host: str, port: int, audit: dict[str, object]) -> str:
    classification = str(audit.get("classification"))
    listener_summary = _format_listener_summary(audit.get("listeners", [])) if isinstance(audit.get("listeners"), list) else "no listeners were identified"
    probe = audit.get("probe") if isinstance(audit.get("probe"), dict) else {}
    probe_kind = probe.get("kind")

    if classification == "healthy_rssmaster":
        reason = "the default port is already occupied by a healthy RSSmaster runtime"
    elif classification == "stale_rssmaster":
        reason = "the default port is occupied by a stale RSSmaster runtime"
    elif classification == "blocked_non_rssmaster":
        reason = "the default port is occupied by a non-RSSmaster listener"
    elif classification == "phantom_listener":
        reason = "the default port reports listener metadata but the socket probe still refuses connections"
    elif classification == "refused":
        reason = "the default port is refusing connections"
    elif classification == "timeout":
        reason = "the default port timed out during probing"
    else:
        reason = f"the default port has unexpected classification {classification}"

    return (
        f"Cold-start proof blocked for {name} on {host}:{port}: {reason}. "
        f"probe={probe_kind}. listeners={listener_summary}."
    )


@dataclass(slots=True, frozen=True)
class RuntimePortChoice:
    chosen_port: int
    selection_reason: str
    preferred_audit: dict[str, object]
    chosen_audit: dict[str, object]
    fallback_candidates: list[dict[str, object]]

    @property
    def fallback_reason(self) -> str | None:
        return _build_fallback_reason(
            str(self.preferred_audit["name"]),
            self.preferred_audit,
            self.chosen_port,
            self.selection_reason,
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "chosen_port": self.chosen_port,
            "selection_reason": self.selection_reason,
            "fallback_reason": self.fallback_reason,
            "preferred_audit": self.preferred_audit,
            "chosen_audit": self.chosen_audit,
            "fallback_candidates": self.fallback_candidates,
        }


def choose_runtime_port(name: str, host: str, preferred_port: int) -> RuntimePortChoice:
    preferred_audit = audit_runtime_port(name, host, preferred_port)
    preferred_classification = str(preferred_audit["classification"])
    if preferred_classification == "healthy_rssmaster":
        return RuntimePortChoice(
            chosen_port=preferred_port,
            selection_reason="default_healthy_rssmaster",
            preferred_audit=preferred_audit,
            chosen_audit=preferred_audit,
            fallback_candidates=[],
        )

    fallback_audits: list[dict[str, object]] = []
    for candidate_port in fallback_ports(preferred_port):
        candidate_audit = audit_runtime_port(name, host, candidate_port)
        fallback_audits.append(candidate_audit)
        if str(candidate_audit["classification"]) == "healthy_rssmaster":
            return RuntimePortChoice(
                chosen_port=candidate_port,
                selection_reason=f"fallback_existing_healthy:{preferred_classification}",
                preferred_audit=preferred_audit,
                chosen_audit=candidate_audit,
                fallback_candidates=fallback_audits,
            )

    if preferred_classification == "free":
        return RuntimePortChoice(
            chosen_port=preferred_port,
            selection_reason="default_free",
            preferred_audit=preferred_audit,
            chosen_audit=preferred_audit,
            fallback_candidates=fallback_audits,
        )

    for candidate_audit in fallback_audits:
        if str(candidate_audit["classification"]) == "free":
            return RuntimePortChoice(
                chosen_port=int(candidate_audit["port"]),
                selection_reason=f"fallback_free:{preferred_classification}",
                preferred_audit=preferred_audit,
                chosen_audit=candidate_audit,
                fallback_candidates=fallback_audits,
            )

    raise RuntimeError(
        f"Could not find a healthy or free port for {name}. "
        f"Tried {preferred_port} and {fallback_ports(preferred_port)}. "
        f"Preferred audit: {json.dumps(preferred_audit, sort_keys=True)}"
    )


def select_runtime_port(name: str, host: str, preferred_port: int, *, allow_fallback: bool = True) -> dict[str, object]:
    preferred_audit = audit_runtime_port(name, host, preferred_port)
    if not allow_fallback:
        preferred_classification = str(preferred_audit["classification"])
        if preferred_classification in {"free", "healthy_rssmaster", "stale_rssmaster"}:
            selection_reason = (
                "default_free"
                if preferred_classification == "free"
                else f"default_cleanup_required:{preferred_classification}"
            )
            return {
                "requested_port": preferred_port,
                "resolved_port": preferred_port,
                "selection_reason": selection_reason,
                "fallback_reason": None,
                "blocker_details": None if preferred_classification == "free" else preferred_audit,
                "requested_audit": preferred_audit,
                "resolved_audit": preferred_audit,
                "fallback_candidates": [],
            }
        raise RuntimeError(cold_start_blocker_message(name, host, preferred_port, preferred_audit))

    choice = choose_runtime_port(name, host, preferred_port)
    preferred_classification = str(choice.preferred_audit["classification"])
    return {
        "requested_port": preferred_port,
        "resolved_port": choice.chosen_port,
        "selection_reason": choice.selection_reason,
        "fallback_reason": choice.fallback_reason,
        "blocker_details": choice.preferred_audit if preferred_classification not in {"free", "healthy_rssmaster"} else None,
        "requested_audit": choice.preferred_audit,
        "resolved_audit": choice.chosen_audit,
        "fallback_candidates": choice.fallback_candidates,
    }


def format_audit_summary(audit: dict[str, object]) -> str:
    classification = audit.get("classification")
    probe = audit.get("probe")
    probe_kind = probe.get("kind") if isinstance(probe, dict) else None
    port = audit.get("port")
    host = audit.get("host")
    return f"{audit.get('name')}: {classification} on {host}:{port} (probe={probe_kind})"


def classify_default_ports(host: str = DEFAULT_HOST) -> dict[str, object]:
    report = audit_runtime_ports(host, DEFAULT_PORTS)
    return {
        "host": host,
        "ports": report["targets"],
        "summary": {name: format_audit_summary(audit) for name, audit in report["targets"].items()},
    }
