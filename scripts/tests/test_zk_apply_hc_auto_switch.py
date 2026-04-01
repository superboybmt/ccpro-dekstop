import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
WRAPPER_PATH = REPO_ROOT / "scripts" / "zk-apply-hc-auto-switch.ps1"
SHORTKEY_TOOL_PATH = REPO_ROOT / "scripts" / "zk-shortkey-tool.ps1"


class ApplyHcAutoSwitchTests(unittest.TestCase):
    def run_powershell(self, script_path: Path, *args: str, fake_state_path: str | None = None) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        if fake_state_path is not None:
            env["ZK_SHORTKEY_FAKE_STATE_PATH"] = fake_state_path

        return subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script_path),
                *args,
            ],
            cwd=REPO_ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_wrapper_applies_hanh_chanh_schedule_without_touching_state_mode(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "shortkeys.json"
            state_path.write_text(
                json.dumps(
                    {
                        "deviceIp": "10.60.1.5",
                        "deviceName": "Mock ZK",
                        "shortKeys": [
                            {
                                "shortKeyId": 1,
                                "shortKeyFun": 1,
                                "stateCode": 0,
                                "stateName": "state0",
                                "autoChange": 0,
                                "autoChangeTime": "00:00;00:00;00:00;00:00;00:00;00:00;00:00",
                            },
                            {
                                "shortKeyId": 2,
                                "shortKeyFun": 1,
                                "stateCode": 1,
                                "stateName": "state1",
                                "autoChange": 0,
                                "autoChangeTime": "00:00;00:00;00:00;00:00;00:00;00:00;00:00",
                            },
                            {
                                "shortKeyId": 5,
                                "shortKeyFun": 1,
                                "stateCode": 2,
                                "stateName": "state2",
                                "autoChange": 0,
                                "autoChangeTime": "00:00;00:00;00:00;00:00;00:00;00:00;00:00",
                            },
                            {
                                "shortKeyId": 6,
                                "shortKeyFun": 1,
                                "stateCode": 3,
                                "stateName": "state3",
                                "autoChange": 0,
                                "autoChangeTime": "00:00;00:00;00:00;00:00;00:00;00:00;00:00",
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )
            result = self.run_powershell(WRAPPER_PATH, "-SkipStateMode", fake_state_path=str(state_path))

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["appliedPreset"], "hanh-chanh-auto-switch")
            self.assertIsNone(payload["stateMode"])

            current = self.run_powershell(SHORTKEY_TOOL_PATH, "get", fake_state_path=str(state_path))
            self.assertEqual(current.returncode, 0, current.stderr)
            shortkeys = {item["shortKeyId"]: item for item in json.loads(current.stdout)["shortKeys"]}

            self.assertEqual(shortkeys[1]["autoChangeTime"], "00:00;00:00;00:00;00:00;00:00;00:00;00:00")
            self.assertEqual(shortkeys[5]["autoChangeTime"], "11:30;11:30;11:30;11:30;11:30;00:00;00:00")
            self.assertEqual(shortkeys[6]["autoChangeTime"], "13:00;13:00;13:00;13:00;13:00;00:00;00:00")
            self.assertEqual(shortkeys[2]["autoChangeTime"], "17:00;17:00;17:00;17:00;17:00;00:00;00:00")
            self.assertEqual(shortkeys[1]["autoChange"], 1)
            self.assertEqual(shortkeys[5]["autoChange"], 1)
            self.assertEqual(shortkeys[6]["autoChange"], 1)
            self.assertEqual(shortkeys[2]["autoChange"], 1)


if __name__ == "__main__":
    unittest.main()
