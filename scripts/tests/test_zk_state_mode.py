import importlib.util
from pathlib import Path
import contextlib
import io
import unittest


def load_module():
    script_path = Path(__file__).resolve().parents[1] / "zk-state-mode.py"
    spec = importlib.util.spec_from_file_location("zk_state_mode", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class FakeConnection:
    def __init__(self, initial_mode="3", device_name="8000T"):
        self.mode = str(initial_mode)
        self.device_name = device_name
        self.disconnected = False

    def get_device_name(self):
        return self.device_name

    def disconnect(self):
        self.disconnected = True


class FakeDevice:
    def __init__(self, connection):
        self.connection = connection

    def connect(self):
        return self.connection


class ZkStateModeTests(unittest.TestCase):
    def test_query_only_returns_current_mode(self):
        module = load_module()
        connection = FakeConnection(initial_mode="3")
        reads = []

        def fake_read_option(conn, key):
            self.assertIs(conn, connection)
            self.assertEqual(key, "StateMode")
            reads.append(connection.mode)
            return connection.mode

        result = module.run(
            [],
            device_factory=lambda args: FakeDevice(connection),
            read_option=fake_read_option,
            write_option=lambda *_args: self.fail("write_option should not be called"),
        )

        self.assertEqual(result["currentMode"], 3)
        self.assertNotIn("updatedMode", result)
        self.assertEqual(result["deviceName"], "8000T")
        self.assertEqual(reads, ["3", "3"])
        self.assertTrue(connection.disconnected)

    def test_set_mode_updates_and_returns_before_after(self):
        module = load_module()
        connection = FakeConnection(initial_mode="3")
        read_values = iter(["3", "3", "5", "5"])

        def fake_read_option(_conn, _key):
            return next(read_values)

        def fake_write_option(_conn, key, value):
            self.assertEqual(key, "StateMode")
            connection.mode = str(value)

        result = module.run(
            ["--mode", "5"],
            device_factory=lambda args: FakeDevice(connection),
            read_option=fake_read_option,
            write_option=fake_write_option,
        )

        self.assertEqual(result["currentMode"], 3)
        self.assertEqual(result["requestedMode"], 5)
        self.assertEqual(result["updatedMode"], 5)
        self.assertTrue(connection.disconnected)

    def test_set_mode_writes_even_when_first_read_is_stale(self):
        module = load_module()
        connection = FakeConnection(initial_mode="5")
        read_values = iter(["3", "5", "3", "3"])
        writes = []

        def fake_read_option(_conn, _key):
            return next(read_values)

        def fake_write_option(_conn, key, value):
            writes.append((key, value))
            connection.mode = str(value)

        result = module.run(
            ["--mode", "3"],
            device_factory=lambda args: FakeDevice(connection),
            read_option=fake_read_option,
            write_option=fake_write_option,
        )

        self.assertEqual(result["currentMode"], 5)
        self.assertEqual(result["updatedMode"], 3)
        self.assertEqual(writes, [("StateMode", 3)])
        self.assertTrue(connection.disconnected)

    def test_invalid_mode_is_rejected(self):
        module = load_module()

        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                module.parse_args(["--mode", "7"])


if __name__ == "__main__":
    unittest.main()
