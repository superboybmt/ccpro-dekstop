import argparse
import json
import os
import sys

from zk import ZK, const


DEFAULT_DEVICE_IP = os.getenv("ZK_DEVICE_IP", "10.60.1.5")
DEFAULT_DEVICE_PORT = int(os.getenv("ZK_DEVICE_PORT", "4370"))
DEFAULT_DEVICE_PASSWORD = int(os.getenv("ZK_DEVICE_PASSWORD", "0"))
STATE_MODE_KEY = "StateMode"
VALID_MODES = tuple(range(6))


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description="Query or update the ZK device StateMode option."
    )
    parser.add_argument("--ip", default=DEFAULT_DEVICE_IP, help="Device IP address.")
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_DEVICE_PORT,
        help="Device TCP port.",
    )
    parser.add_argument(
        "--password",
        type=int,
        default=DEFAULT_DEVICE_PASSWORD,
        help="Device communication password.",
    )
    parser.add_argument(
        "--mode",
        type=int,
        choices=VALID_MODES,
        help="Optional StateMode value to write (0-5).",
    )
    return parser.parse_args(argv)


def create_device(args):
    return ZK(
        args.ip,
        port=args.port,
        timeout=10,
        password=args.password,
        force_udp=False,
        ommit_ping=True,
    )


def read_option(connection, key):
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


def write_option(connection, key, value):
    send_command = getattr(connection, "_ZK__send_command")
    response = send_command(const.CMD_OPTIONS_WRQ, f"{key}={value}".encode(), 1024)
    if not response.get("status"):
        raise RuntimeError(f"Cannot write option {key}={value}")


def read_mode_stable(connection, read_option_fn, attempts=2):
    last_value = None

    for _ in range(attempts):
        last_value = int(read_option_fn(connection, STATE_MODE_KEY))

    if last_value is None:
        raise RuntimeError("Cannot read current StateMode")

    return last_value


def query_device(args, device_factory, read_option_fn):
    connection = None

    try:
        device = device_factory(args)
        connection = device.connect()
        return {
            "deviceName": connection.get_device_name(),
            "mode": read_mode_stable(connection, read_option_fn),
        }
    finally:
        if connection is not None:
            try:
                connection.disconnect()
            except Exception:
                pass


def set_device_mode(args, device_factory, write_option_fn, mode):
    connection = None

    try:
        device = device_factory(args)
        connection = device.connect()
        write_option_fn(connection, STATE_MODE_KEY, mode)
    finally:
        if connection is not None:
            try:
                connection.disconnect()
            except Exception:
                pass


def run(argv, device_factory=create_device, read_option=read_option, write_option=write_option):
    args = parse_args(argv)
    current_state = query_device(args, device_factory, read_option)
    result = {
        "deviceIp": args.ip,
        "devicePort": args.port,
        "deviceName": current_state["deviceName"],
        "currentMode": current_state["mode"],
    }

    if args.mode is not None:
        result["requestedMode"] = args.mode
        set_device_mode(args, device_factory, write_option, args.mode)
        updated_state = query_device(args, device_factory, read_option)
        result["updatedMode"] = updated_state["mode"]

    return result


def main(argv=None):
    try:
        result = run(sys.argv[1:] if argv is None else argv)
        print(json.dumps(result, ensure_ascii=True, indent=2))
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=True))
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
