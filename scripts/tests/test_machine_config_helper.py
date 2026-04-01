import base64
import contextlib
import importlib.util
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "machine-config-helper.py"
SPEC = importlib.util.spec_from_file_location("machine_config_helper", MODULE_PATH)
machine_config_helper = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
SPEC.loader.exec_module(machine_config_helper)


class MachineConfigHelperTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
