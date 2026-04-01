import importlib.util
from pathlib import Path
from struct import pack
import unittest


def load_worker_module():
    worker_path = Path(__file__).resolve().parents[1] / "device-sync-worker.py"
    spec = importlib.util.spec_from_file_location("device_sync_worker", worker_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def encode_time(year, month, day, hour, minute, second):
    value = year - 2000
    value = value * 12 + (month - 1)
    value = value * 31 + (day - 1)
    value = value * 24 + hour
    value = value * 60 + minute
    value = value * 60 + second
    return pack("<I", value)


def build_record(uid, user_id, status, timestamp, punch):
    user_bytes = user_id.encode("ascii").ljust(24, b"\x00")
    return pack(
        "<H24sB4sB8s",
        uid,
        user_bytes,
        status,
        encode_time(
            timestamp.year,
            timestamp.month,
            timestamp.day,
            timestamp.hour,
            timestamp.minute,
            timestamp.second,
        ),
        punch,
        b"\x00" * 8,
    )


class ExtractLogsFromBufferTests(unittest.TestCase):
    def test_reads_only_incremental_tail_records_when_record_count_grows(self):
        worker = load_worker_module()
        payload = (
            build_record(1, "1", 0, worker.datetime(2026, 3, 31, 8, 0, 0), 0)
            + build_record(2, "2", 0, worker.datetime(2026, 3, 31, 8, 1, 0), 0)
            + build_record(3, "3", 0, worker.datetime(2026, 3, 31, 8, 2, 0), 0)
            + build_record(4, "4", 0, worker.datetime(2026, 3, 31, 8, 3, 0), 0)
            + build_record(5, "5", 0, worker.datetime(2026, 3, 31, 8, 4, 0), 0)
        )
        data = pack("<I", len(payload)) + payload

        logs = worker.extract_new_logs_from_buffer(
            attendance_data=data,
            record_count=5,
            last_log_uid=3,
            last_log_time=worker.datetime(2026, 3, 31, 8, 2, 0),
            last_device_record_count=3,
            bootstrap_days=7,
            current_time=worker.datetime(2026, 3, 31, 9, 0, 0),
        )

        self.assertEqual(
            logs,
            [
                {
                    "uid": 4,
                    "userId": "4",
                    "timestamp": "2026-03-31T08:03:00",
                    "status": 0,
                    "punch": 0,
                },
                {
                    "uid": 5,
                    "userId": "5",
                    "timestamp": "2026-03-31T08:04:00",
                    "status": 0,
                    "punch": 0,
                },
            ],
        )


if __name__ == "__main__":
    unittest.main()
