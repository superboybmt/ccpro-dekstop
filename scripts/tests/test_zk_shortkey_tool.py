import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "zk-shortkey-tool.ps1"


class ZkShortKeyToolTest(unittest.TestCase):
    def run_tool(self, *args: str, fake_state_path: str | None = None) -> subprocess.CompletedProcess[str]:
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
                str(SCRIPT_PATH),
                *args,
            ],
            cwd=REPO_ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_get_outputs_expected_shape(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = str(Path(temp_dir) / "shortkeys.json")
            result = self.run_tool("get", "--ip", "10.60.1.9", fake_state_path=state_path)

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)

            self.assertEqual(payload["deviceIp"], "10.60.1.9")
            self.assertEqual(payload["deviceName"], "Mock ZK")
            self.assertEqual(len(payload["shortKeys"]), 4)
            self.assertEqual(payload["shortKeys"][0]["shortKeyId"], 1)

    def test_set_requires_required_options(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = str(Path(temp_dir) / "shortkeys.json")
            result = self.run_tool("set", "--shortKeyId", "1", fake_state_path=state_path)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Missing required option '--stateCode'.", result.stderr)

    def test_set_updates_fake_state_and_returns_updated_shortkey(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = str(Path(temp_dir) / "shortkeys.json")
            result = self.run_tool(
                "set",
                "--shortKeyId",
                "2",
                "--shortKeyFun",
                "7",
                "--stateCode",
                "9",
                "--stateName",
                "Out PM",
                "--autoChange",
                "1",
                "--autoChangeTime",
                "17:00;17:00;17:00;17:00;17:00;00:00;00:00;",
                fake_state_path=state_path,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            updated_key = next(item for item in payload["shortKeys"] if item["shortKeyId"] == 2)
            self.assertEqual(updated_key["shortKeyFun"], 7)
            self.assertEqual(updated_key["stateCode"], 9)
            self.assertEqual(updated_key["stateName"], "Out PM")

            confirm = self.run_tool("get", fake_state_path=state_path)
            self.assertEqual(confirm.returncode, 0, confirm.stderr)
            confirm_payload = json.loads(confirm.stdout)
            persisted_key = next(item for item in confirm_payload["shortKeys"] if item["shortKeyId"] == 2)
            self.assertEqual(persisted_key["autoChangeTime"], "17:00;17:00;17:00;17:00;17:00;00:00;00:00;")

    def test_invalid_command_fails_clearly(self) -> None:
        result = self.run_tool("sync")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unsupported command 'sync'.", result.stderr)


if __name__ == "__main__":
    unittest.main()
