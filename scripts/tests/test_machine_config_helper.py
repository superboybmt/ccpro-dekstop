import base64
import contextlib
import importlib.util
import io
import json
import unittest
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "machine-config-helper.py"
SPEC = importlib.util.spec_from_file_location("machine_config_helper", MODULE_PATH)
machine_config_helper = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
SPEC.loader.exec_module(machine_config_helper)


class MachineConfigHelperTest(unittest.TestCase):
    def test_packaged_payload_is_staged_next_to_the_executable(self):
        with TemporaryDirectory() as payload_dir_name, TemporaryDirectory() as runtime_dir_name:
            payload_dir = Path(payload_dir_name)
            runtime_dir = Path(runtime_dir_name)
            runtime_exe = runtime_dir / "machine-config-helper.exe"
            runtime_exe.write_text("stub", encoding="utf-8")

            (payload_dir / "sdk").mkdir()
            (payload_dir / "scripts").mkdir()
            (payload_dir / "sdk" / "zkemkeeper.dll").write_text("dll", encoding="utf-8")
            (payload_dir / "scripts" / "zk-ssr-device-data-tool.ps1").write_text("script", encoding="utf-8")

            with (
                patch.object(machine_config_helper, "is_packaged", return_value=True),
                patch.object(machine_config_helper.sys, "_MEIPASS", str(payload_dir), create=True),
                patch.object(machine_config_helper.sys, "executable", str(runtime_exe)),
            ):
                machine_config_helper.stage_packaged_payload()

                self.assertTrue((runtime_dir / "sdk" / "zkemkeeper.dll").exists())
                self.assertTrue((runtime_dir / "scripts" / "zk-ssr-device-data-tool.ps1").exists())
                self.assertEqual(
                    machine_config_helper.sdk_dir_path(),
                    str(runtime_dir / "sdk"),
                )
                self.assertEqual(
                    machine_config_helper.ssr_tool_path(),
                    str(runtime_dir / "scripts" / "zk-ssr-device-data-tool.ps1"),
                )

    def test_packaged_payload_overwrites_stale_runtime_artifacts(self):
        with TemporaryDirectory() as payload_dir_name, TemporaryDirectory() as runtime_dir_name:
            payload_dir = Path(payload_dir_name)
            runtime_dir = Path(runtime_dir_name)
            runtime_exe = runtime_dir / "machine-config-helper.exe"
            runtime_exe.write_text("stub", encoding="utf-8")

            (payload_dir / "sdk").mkdir()
            (payload_dir / "scripts").mkdir()
            (payload_dir / "sdk" / "zkemkeeper.dll").write_text("new-dll", encoding="utf-8")
            (payload_dir / "scripts" / "zk-ssr-device-data-tool.ps1").write_text("new-script", encoding="utf-8")

            (runtime_dir / "sdk").mkdir()
            (runtime_dir / "scripts").mkdir()
            (runtime_dir / "sdk" / "zkemkeeper.dll").write_text("old-dll", encoding="utf-8")
            (runtime_dir / "scripts" / "zk-ssr-device-data-tool.ps1").write_text("old-script", encoding="utf-8")

            with (
                patch.object(machine_config_helper, "is_packaged", return_value=True),
                patch.object(machine_config_helper.sys, "_MEIPASS", str(payload_dir), create=True),
                patch.object(machine_config_helper.sys, "executable", str(runtime_exe)),
            ):
                machine_config_helper.stage_packaged_payload()

            self.assertEqual(
                (runtime_dir / "sdk" / "zkemkeeper.dll").read_text(encoding="utf-8"),
                "new-dll",
            )
            self.assertEqual(
                (runtime_dir / "scripts" / "zk-ssr-device-data-tool.ps1").read_text(encoding="utf-8"),
                "new-script",
            )

    def test_main_get_config_prints_json_payload(self):
        fake_config = {
            "stateMode": 2,
            "schedule": [{"stateKey": "{}", "stateList": "{}", "stateTimezone": "{\"montime\":\"700\"}"}],
        }

        with patch.object(machine_config_helper, "get_config", return_value=fake_config):
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                machine_config_helper.main(
                    ["get-config", "--ip", "10.60.1.5", "--port", "4370", "--password", "938948"]
                )

        self.assertEqual(json.loads(stdout.getvalue().strip()), fake_config)

    def test_save_config_updates_mode_and_writes_all_ssr_rows(self):
        payload = {
            "stateMode": 3,
            "schedule": [
                {
                    "stateKey": json.dumps({"statecode": "0", "funcname": "state0", "statename": "Dang nhap"}),
                    "stateList": json.dumps({"funcname": "state0", "statetimezonename": "time1"}),
                    "stateTimezone": "07:30",
                }
            ],
        }
        before = {"stateMode": 2, "schedule": []}
        after = {
            "stateMode": 3,
            "schedule": [
                {
                    "stateKey": json.dumps({"statecode": "0", "funcname": "state0", "statename": "Dang nhap"}),
                    "stateList": json.dumps({"funcname": "state0", "statetimezonename": "time1"}),
                    "stateTimezone": json.dumps({"statetimezonename": "time1", "montime": "730"}),
                }
            ],
        }

        with (
            patch.object(machine_config_helper, "get_config", side_effect=[before, after]),
            patch.object(machine_config_helper, "update_state_mode") as update_state_mode,
            patch.object(machine_config_helper, "set_ssr_row") as set_ssr_row,
        ):
            result = machine_config_helper.save_config("10.60.1.5", 4370, 938948, payload)

        self.assertTrue(result["ok"])
        self.assertEqual(result["before"], before)
        self.assertEqual(result["after"], after)
        update_state_mode.assert_called_once_with("10.60.1.5", 4370, 938948, 3)
        self.assertEqual(set_ssr_row.call_count, 3)

    def test_main_save_config_requires_payload(self):
        stdout = io.StringIO()

        with contextlib.redirect_stdout(stdout):
            with self.assertRaises(SystemExit) as error:
                machine_config_helper.main(
                    ["save-config", "--ip", "10.60.1.5", "--port", "4370", "--password", "938948"]
                )

        self.assertEqual(error.exception.code, 1)
        self.assertEqual(
            json.loads(stdout.getvalue().strip()),
            {"ok": False, "message": "Missing --payloadB64"},
        )

    def test_main_preflight_sdk_prints_json_payload(self):
        fake_result = {
            "ok": True,
            "message": "Bundled SDK is ready through current-user COM registration.",
        }

        with patch.object(machine_config_helper, "preflight_machine_config_sdk", return_value=fake_result):
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                machine_config_helper.main(["preflight-sdk"])

        self.assertEqual(json.loads(stdout.getvalue().strip()), fake_result)


if __name__ == "__main__":
    unittest.main()
