import argparse
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from zk import ZK, const


SCHEDULE_STATE_ORDER = ("0", "2", "3", "1")
DEFAULT_STATE_NAMES = {
    "0": "Dang nhap",
    "1": "Dang xuat",
    "2": "",
    "3": "",
    "4": "",
    "5": "",
}


def is_packaged() -> bool:
    return bool(getattr(sys, "frozen", False))


def runtime_root() -> Path:
    if is_packaged():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def bundled_root() -> Path:
    if hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return runtime_root()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def sync_file(source_path: Path, target_path: Path) -> None:
    if target_path.exists() and sha256_file(source_path) == sha256_file(target_path):
        return

    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, target_path)


def sync_directory(source_dir: Path, target_dir: Path) -> None:
    if not source_dir.exists():
        return

    for source_path in source_dir.rglob("*"):
        if source_path.is_dir():
            continue
        sync_file(source_path, target_dir / source_path.relative_to(source_dir))


def stage_packaged_payload() -> None:
    if not is_packaged() or not hasattr(sys, "_MEIPASS"):
        return

    source_root = bundled_root()
    target_root = runtime_root()
    if source_root == target_root:
        return

    source_sdk_dir = source_root / "sdk"
    target_sdk_dir = target_root / "sdk"
    sync_directory(source_sdk_dir, target_sdk_dir)

    source_scripts_dir = source_root / "scripts"
    source_ssr_tool = source_scripts_dir / "zk-ssr-device-data-tool.ps1"
    target_ssr_tool = target_root / "scripts" / "zk-ssr-device-data-tool.ps1"
    if source_ssr_tool.exists():
        sync_file(source_ssr_tool, target_ssr_tool)


def powershell_32_path() -> str:
    system_root = os.environ.get("SystemRoot", r"C:\Windows")
    return str(Path(system_root) / "SysWOW64" / "WindowsPowerShell" / "v1.0" / "powershell.exe")


def ssr_tool_path() -> str:
    stage_packaged_payload()
    return str(runtime_root() / "scripts" / "zk-ssr-device-data-tool.ps1")


def sdk_dir_path() -> str:
    stage_packaged_payload()
    return str(runtime_root() / "sdk")


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Machine config helper for ZKTeco devices.")
    parser.add_argument("command", choices=("preflight-sdk", "get-config", "save-config", "sync-time", "bootstrap-app-config"))
    parser.add_argument("--ip")
    parser.add_argument("--port", type=int)
    parser.add_argument("--password", type=int)
    parser.add_argument("--payloadB64")
    parser.add_argument("--output")
    parser.add_argument("--seed")
    parsed = parser.parse_args(argv)

    if parsed.command == "bootstrap-app-config":
        if not parsed.output or not parsed.seed:
            parser.error("--output and --seed are required for bootstrap-app-config")
        return parsed

    if parsed.command == "preflight-sdk":
        return parsed

    if parsed.ip is None or parsed.port is None or parsed.password is None:
        parser.error("--ip, --port, and --password are required for device commands")

    return parsed


def create_device(ip: str, port: int, password: int):
    return ZK(
        ip,
        port=port,
        timeout=10,
        password=password,
        force_udp=False,
        ommit_ping=True,
    )


def read_option(connection, key: str):
    send_command = getattr(connection, "_ZK__send_command")
    response = send_command(const.CMD_OPTIONS_RRQ, f"{key}\x00".encode(), 1024)
    if not response.get("status"):
        raise RuntimeError(f"Cannot read option {key}")

    raw_data = getattr(connection, "_ZK__data", b"")
    text = raw_data.split(b"\x00")[0].decode(errors="ignore")
    _, _, value = text.partition("=")
    if not value:
        raise RuntimeError(f"Invalid response for option {key}: {text!r}")
    return value


def write_option(connection, key: str, value: int):
    send_command = getattr(connection, "_ZK__send_command")
    response = send_command(const.CMD_OPTIONS_WRQ, f"{key}={value}".encode(), 1024)
    if not response.get("status"):
        raise RuntimeError(f"Cannot write option {key}={value}")


def query_state_mode(ip: str, port: int, password: int) -> int:
    connection = None
    try:
        device = create_device(ip, port, password)
        connection = device.connect()
        return int(read_option(connection, "StateMode"))
    finally:
        if connection is not None:
            try:
                connection.disconnect()
            except Exception:
                pass


def update_state_mode(ip: str, port: int, password: int, mode: int) -> None:
    connection = None
    try:
        device = create_device(ip, port, password)
        connection = device.connect()
        write_option(connection, "StateMode", mode)
    finally:
        if connection is not None:
            try:
                connection.disconnect()
            except Exception:
                pass


def run_ssr_tool(ip: str, port: int, password: int, command: str, extra_args: list[str]) -> dict:
    completed = subprocess.run(
        [
            powershell_32_path(),
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            ssr_tool_path(),
            command,
            "--ip",
            ip,
            "--port",
            str(port),
            "--password",
            str(password),
            "--sdkDir",
            sdk_dir_path(),
            *extra_args,
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )

    stdout = completed.stdout.strip()
    stderr = completed.stderr.strip()
    if completed.returncode != 0:
        raise RuntimeError(stderr or stdout or f"SSR tool failed with exit code {completed.returncode}")

    return json.loads(stdout) if stdout else {}


def preflight_machine_config_sdk() -> dict:
    return run_ssr_tool("127.0.0.1", 4370, 0, "preflight", [])


def get_ssr_rows(ip: str, port: int, password: int, table: str) -> list[dict[str, str]]:
    result = run_ssr_tool(ip, port, password, "get", ["--table", table])
    return result.get("rows", [])


def set_ssr_row(ip: str, port: int, password: int, table: str, row: dict[str, str], verify_filter: str) -> dict:
    data = "\t".join(f"{key}={value}" for key, value in row.items())
    return run_ssr_tool(
        ip,
        port,
        password,
        "set",
        ["--table", table, "--dataB64", base64.b64encode(data.encode("utf-8")).decode("ascii"), "--verifyFilter", verify_filter],
    )


def parse_json_row(value: str) -> dict[str, str]:
    try:
        parsed = json.loads(value)
    except Exception:
        return {}
    return {str(key): "" if row_value is None else str(row_value) for key, row_value in parsed.items()}


def format_row_time_to_hhmm(value: str) -> str:
    digits = value.strip()
    if not digits:
        return ""
    numeric = int(digits)
    hours = numeric // 100
    minutes = numeric % 100
    return f"{hours:02d}:{minutes:02d}"


def resolve_schedule_time(value: str) -> str:
    if len(value) == 5 and value[2] == ":":
        return value

    row = parse_json_row(value)
    preferred = (
        row.get("montime")
        or row.get("tuetime")
        or row.get("wedtime")
        or row.get("thutime")
        or row.get("fritime")
        or row.get("sattime")
        or row.get("suntime")
        or ""
    )
    return format_row_time_to_hhmm(preferred)


def format_device_time(value: str) -> str:
    hours_text, minutes_text = value.split(":")
    total = (int(hours_text) * 100) + int(minutes_text)
    return "0" if total == 0 else str(total)


def resolve_state_name(state_code: str, raw_name: str) -> str:
    trimmed = raw_name.strip()
    if not trimmed:
        return DEFAULT_STATE_NAMES.get(state_code, "")

    if all(32 <= ord(char) <= 126 for char in trimmed):
        return trimmed

    fallback = DEFAULT_STATE_NAMES.get(state_code, "")
    if fallback:
        return fallback

    normalized = trimmed.replace("đ", "d").replace("Đ", "D")
    return "".join(char for char in normalized if 32 <= ord(char) <= 126).strip()


def build_schedule_rows(state: dict[str, str]) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    state_key_row = parse_json_row(state.get("stateKey", ""))
    state_list_row = parse_json_row(state.get("stateList", ""))
    state_code = state_key_row.get("statecode", "").strip()
    func_name = (state_key_row.get("funcname") or state_list_row.get("funcname") or "").strip()
    timezone_name = (state_list_row.get("statetimezonename") or "").strip()
    schedule_time = resolve_schedule_time(state.get("stateTimezone", ""))

    if not state_code or not func_name or not timezone_name or not schedule_time:
        raise RuntimeError("Invalid schedule payload")

    state_key = {
        "statecode": state_code,
        "funcname": func_name,
        "statename": resolve_state_name(state_code, state_key_row.get("statename", "")),
        "autochange": "1",
        "mon": "1",
        "tue": "1",
        "wed": "1",
        "thu": "1",
        "fri": "1",
        "sat": "0",
        "sun": "0",
    }
    state_list = {
        "funcname": func_name,
        "statetimezonename": timezone_name,
    }
    time_value = format_device_time(schedule_time)
    state_timezone = {
        "statetimezonename": timezone_name,
        "montime": time_value,
        "tuetime": time_value,
        "wedtime": time_value,
        "thutime": time_value,
        "fritime": time_value,
        "sattime": "0",
        "suntime": "0",
    }
    return state_key, state_list, state_timezone


def read_schedule(ip: str, port: int, password: int) -> list[dict[str, str]]:
    state_key_by_code = {str(row.get("statecode", "")): row for row in get_ssr_rows(ip, port, password, "statekey")}
    state_list_by_func = {str(row.get("funcname", "")): row for row in get_ssr_rows(ip, port, password, "statelist")}
    state_timezone_by_name = {
        str(row.get("statetimezonename", "")): row for row in get_ssr_rows(ip, port, password, "statetimezone")
    }

    result: list[dict[str, str]] = []
    for state_code in SCHEDULE_STATE_ORDER:
        state_key = state_key_by_code.get(state_code)
        if not state_key:
            continue

        state_list = state_list_by_func.get(str(state_key.get("funcname", "")), {})
        state_timezone = state_timezone_by_name.get(str(state_list.get("statetimezonename", "")), {})
        result.append(
            {
                "stateKey": json.dumps(state_key, ensure_ascii=True),
                "stateList": json.dumps(state_list, ensure_ascii=True),
                "stateTimezone": json.dumps(state_timezone, ensure_ascii=True),
            }
        )

    return result


def get_config(ip: str, port: int, password: int) -> dict:
    return {
        "stateMode": query_state_mode(ip, port, password),
        "schedule": read_schedule(ip, port, password),
    }


def normalize_schedule_entry(state: dict[str, str]) -> dict[str, str]:
    state_key_row = parse_json_row(state.get("stateKey", ""))
    state_list_row = parse_json_row(state.get("stateList", ""))
    return {
        "stateCode": state_key_row.get("statecode", ""),
        "funcName": state_key_row.get("funcname") or state_list_row.get("funcname", ""),
        "timeZoneName": state_list_row.get("statetimezonename", ""),
        "time": resolve_schedule_time(state.get("stateTimezone", "")),
    }


def verify_schedule(expected: list[dict[str, str]], actual: list[dict[str, str]]) -> bool:
    if len(expected) != len(actual):
        return False

    for expected_state, actual_state in zip(expected, actual):
        if normalize_schedule_entry(expected_state) != normalize_schedule_entry(actual_state):
            return False

    return True


def save_config(ip: str, port: int, password: int, payload: dict) -> dict:
    before = get_config(ip, port, password)

    target_mode = int(payload["stateMode"])
    if before["stateMode"] != target_mode:
        update_state_mode(ip, port, password, target_mode)

    for state in payload.get("schedule", []):
        state_key, state_list, state_timezone = build_schedule_rows(state)
        set_ssr_row(ip, port, password, "statekey", state_key, f"statecode={state_key['statecode']}")
        set_ssr_row(ip, port, password, "statelist", state_list, f"funcname={state_list['funcname']}")
        set_ssr_row(
            ip,
            port,
            password,
            "statetimezone",
            state_timezone,
            f"statetimezonename={state_timezone['statetimezonename']}",
        )

    after = get_config(ip, port, password)
    mode_verified = after["stateMode"] == target_mode
    schedule_verified = verify_schedule(payload.get("schedule", []), after["schedule"])
    ok = mode_verified and schedule_verified

    return {
        "ok": ok,
        "message": "Lưu cấu hình thành công và đã xác minh readback" if ok else "Readback không khớp hoàn toàn với cấu hình yêu cầu",
        "before": before,
        "after": after,
    }


def sync_time(ip: str, port: int, password: int) -> dict:
    connection = None
    try:
        device = create_device(ip, port, password)
        connection = device.connect()
        now = datetime.now()
        connection.set_time(now)
        return {
            "ok": True,
            "message": f"Đồng bộ thời gian thành công ({now.strftime('%Y-%m-%d %H:%M:%S')})",
            "time": now.isoformat()
        }
    finally:
        if connection is not None:
            try:
                connection.disconnect()
            except Exception:
                pass


def bootstrap_app_config(output_path: str, seed_path: str) -> dict:
    output = Path(output_path)
    seed = Path(seed_path)

    if output.exists():
        return {
            "ok": True,
            "message": "Local app config already exists",
            "outputPath": str(output),
        }

    if not seed.exists():
        raise RuntimeError(f"Seed file not found: {seed}")

    config_data = json.loads(seed.read_text(encoding="utf-8"))
    output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile("w", delete=False, dir=output.parent, encoding="utf-8", newline="\n") as handle:
        json.dump(config_data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temp_path = Path(handle.name)

    temp_path.replace(output)

    return {
        "ok": True,
        "message": "Bootstrapped local app config",
        "outputPath": str(output),
    }


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)

    try:
        if args.command == "bootstrap-app-config":
            result = bootstrap_app_config(args.output, args.seed)
        elif args.command == "preflight-sdk":
            result = preflight_machine_config_sdk()
        elif args.command == "get-config":
            result = get_config(args.ip, args.port, args.password)
        elif args.command == "sync-time":
            result = sync_time(args.ip, args.port, args.password)
        else:
            if not args.payloadB64:
                raise RuntimeError("Missing --payloadB64")
            payload = json.loads(base64.b64decode(args.payloadB64).decode("utf-8"))
            result = save_config(args.ip, args.port, args.password, payload)

        print(json.dumps(result, ensure_ascii=True))
    except Exception as error:
        print(json.dumps({"ok": False, "message": str(error)}, ensure_ascii=True))
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()

