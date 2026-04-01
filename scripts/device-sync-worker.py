import json
import sys
from datetime import datetime, timedelta
from struct import unpack

INCREMENTAL_TAIL_PADDING = 25
MIN_INCREMENTAL_SCAN = 100
LIVE_CAPTURE_BATCH_SIZE = 10
LIVE_CAPTURE_TIMEOUT_SECONDS = 2


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=True))
    sys.stdout.flush()


def emit_line(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def parse_input():
    if len(sys.argv) < 2:
        raise ValueError("Missing worker payload")
    payload = json.loads(sys.argv[1])
    if "input" in payload:
        return payload
    return {"mode": "once", "input": payload}


def parse_iso_datetime(value):
    if not value:
        return None

    normalized = value.strip().replace("Z", "")
    return datetime.fromisoformat(normalized)


def serialize_device_time(value):
    if value is None:
        return None
    return value.strftime("%Y-%m-%dT%H:%M:%S")


def serialize_log(log):
    return {
        "uid": int(log["uid"]),
        "userId": str(log["userId"]),
        "timestamp": serialize_device_time(log["timestamp"]),
        "status": int(log["status"]),
        "punch": int(log["punch"]),
    }


def decode_time(value):
    value = unpack("<I", value)[0]
    second = value % 60
    value = value // 60

    minute = value % 60
    value = value // 60

    hour = value % 24
    value = value // 24

    day = value % 31 + 1
    value = value // 31

    month = value % 12 + 1
    value = value // 12

    year = value + 2000

    return datetime(year, month, day, hour, minute, second)


def load_user_lookup(connection, record_size):
    if record_size not in (8, 16):
        return {}

    return {str(user.uid): user.user_id for user in connection.get_users()}


def parse_attendance_record(record_bytes, record_size, user_lookup):
    if record_size == 8:
        uid, status, time_bytes, punch = unpack("HB4sB", record_bytes.ljust(8, b"\x00")[:8])
        return {
            "uid": int(uid),
            "userId": str(user_lookup.get(str(uid), uid)),
            "timestamp": decode_time(time_bytes),
            "status": int(status),
            "punch": int(punch),
        }

    if record_size == 16:
        user_id, time_bytes, status, punch, _reserved, _workcode = unpack(
            "<I4sBB2sI", record_bytes.ljust(16, b"\x00")[:16]
        )
        user_id = str(user_id)
        return {
            "uid": int(user_id),
            "userId": str(user_lookup.get(user_id, user_id)),
            "timestamp": decode_time(time_bytes),
            "status": int(status),
            "punch": int(punch),
        }

    uid, user_id, status, time_bytes, punch, _space = unpack("<H24sB4sB8s", record_bytes.ljust(40, b"\x00")[:40])
    return {
        "uid": int(uid),
        "userId": user_id.split(b"\x00")[0].decode(errors="ignore"),
        "timestamp": decode_time(time_bytes),
        "status": int(status),
        "punch": int(punch),
    }


def resolve_scan_limit(record_count, last_device_record_count):
    if last_device_record_count is None:
        return None

    delta = max(int(record_count) - int(last_device_record_count), 0)
    return min(int(record_count), max(delta + INCREMENTAL_TAIL_PADDING, MIN_INCREMENTAL_SCAN))


def extract_new_logs_from_buffer(
    attendance_data,
    record_count,
    last_log_uid,
    last_log_time,
    last_device_record_count,
    bootstrap_days,
    current_time,
    connection=None,
):
    if not attendance_data or record_count <= 0:
        return []

    total_size = unpack("I", attendance_data[:4])[0]
    if total_size <= 0:
        return []

    record_size = int(total_size / record_count)
    if record_size not in (8, 16, 40):
        raise ValueError(f"Unsupported attendance record size: {record_size}")

    payload = attendance_data[4:]
    user_lookup = load_user_lookup(connection, record_size) if connection is not None else {}
    bootstrap_threshold = current_time - timedelta(days=bootstrap_days)
    scan_limit = resolve_scan_limit(record_count, last_device_record_count)
    scanned_count = 0
    collected_logs = []

    for offset in range(len(payload) - record_size, -1, -record_size):
        if scan_limit is not None and scanned_count >= scan_limit:
            break

        log = parse_attendance_record(payload[offset : offset + record_size], record_size, user_lookup)
        scanned_count += 1
        timestamp = log["timestamp"]

        if timestamp is None:
            continue

        if last_log_time is not None:
            if timestamp < last_log_time:
                break
            if timestamp == last_log_time and last_log_uid is not None and int(log["uid"]) <= int(last_log_uid):
                continue
        elif timestamp < bootstrap_threshold:
            break

        collected_logs.append(
            serialize_log(log)
        )

    collected_logs.reverse()
    return collected_logs


def connect_device(payload):
    from zk import ZK

    zk = ZK(
        payload["deviceIp"],
        port=int(payload["devicePort"]),
        timeout=10,
        password=int(payload["devicePassword"]),
        force_udp=False,
        ommit_ping=True,
    )
    return zk.connect()


def read_snapshot(connection, payload):
    from zk import const

    bootstrap_days = int(payload["bootstrapDays"])
    last_log_uid = payload.get("lastLogUid")
    last_log_time = parse_iso_datetime(payload.get("lastLogTime"))
    last_device_record_count = payload.get("lastDeviceRecordCount")

    connection.read_sizes()
    record_count = int(getattr(connection, "records", 0) or 0)
    device_time = connection.get_time()

    if last_log_time and last_device_record_count is not None and record_count <= int(last_device_record_count):
        return {
            "deviceIp": payload["deviceIp"],
            "recordCount": record_count,
            "deviceTime": serialize_device_time(device_time),
            "logs": [],
            "warnings": [],
        }

    attendance_data, _size = connection.read_with_buffer(const.CMD_ATTLOG_RRQ)
    new_logs = extract_new_logs_from_buffer(
        attendance_data=attendance_data,
        record_count=record_count,
        last_log_uid=last_log_uid,
        last_log_time=last_log_time,
        last_device_record_count=last_device_record_count,
        bootstrap_days=bootstrap_days,
        current_time=device_time or datetime.now(),
        connection=connection,
    )

    return {
        "deviceIp": payload["deviceIp"],
        "recordCount": record_count,
        "deviceTime": serialize_device_time(device_time),
        "logs": new_logs,
        "warnings": [],
    }


def run_once(payload):
    connection = None

    try:
        connection = connect_device(payload)
        return read_snapshot(connection, payload)
    finally:
        if connection is not None:
            try:
                connection.disconnect()
            except Exception:
                pass


def flush_live_logs(device_ip, pending_logs):
    if not pending_logs:
        return

    emit_line(
        {
            "type": "batch",
            "result": {
                "deviceIp": device_ip,
                "recordCount": None,
                "deviceTime": pending_logs[-1]["timestamp"],
                "logs": [serialize_log(log) for log in pending_logs],
                "warnings": [],
            },
        }
    )
    pending_logs.clear()


def run_daemon(payload):
    connection = None

    try:
        connection = connect_device(payload)
        snapshot = read_snapshot(connection, payload)

        emit_line(
            {
                "type": "ready",
                "result": {
                    "deviceIp": snapshot["deviceIp"],
                    "recordCount": snapshot["recordCount"],
                    "deviceTime": snapshot["deviceTime"],
                },
            }
        )

        if snapshot["logs"]:
            emit_line({"type": "batch", "result": snapshot})

        pending_logs = []
        for item in connection.live_capture(new_timeout=LIVE_CAPTURE_TIMEOUT_SECONDS):
            if item is None:
                flush_live_logs(payload["deviceIp"], pending_logs)
                continue

            pending_logs.append(
                {
                    "uid": int(item.uid),
                    "userId": str(item.user_id),
                    "timestamp": item.timestamp,
                    "status": int(item.status),
                    "punch": int(item.punch),
                }
            )

            if len(pending_logs) >= LIVE_CAPTURE_BATCH_SIZE:
                flush_live_logs(payload["deviceIp"], pending_logs)
    finally:
        if connection is not None:
            try:
                connection.disconnect()
            except Exception:
                pass


def main():
    try:
        request = parse_input()
        try:
            from zk import ZK  # noqa: F401
        except Exception as error:
            emit({"ok": False, "error": f"Khong import duoc pyzk: {error}"})
            return

        mode = request.get("mode") or "once"
        payload = request["input"]

        if mode == "daemon":
            run_daemon(payload)
            return

        emit({"ok": True, "result": run_once(payload)})
    except Exception as error:
        emit({"ok": False, "error": str(error)})


if __name__ == "__main__":
    main()
