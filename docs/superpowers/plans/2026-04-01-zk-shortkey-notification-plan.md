# ZK Shortkey And Notification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows-only prototype for reading/writing ZKTeco shortcut-key auto-switch settings and switch notification logic to derive in/out meaning from WiseEye `Schedule/InOutArr/InOut` instead of raw `OriginType`.

**Architecture:** Keep the shortcut-key experiment outside the app as a Windows-only internal tool using official COM/SDK calls, so device-specific risk stays isolated. In parallel, refactor notification classification into a small schedule-driven domain path that queries WiseEye metadata per work date and classifies punches by configured time windows before generating alerts.

**Tech Stack:** Electron main process TypeScript, Vitest, PowerShell, embedded C#, ZKTeco COM/SDK (`zkemkeeper`), SQL Server / WiseEye

---

## File Map

- Create: `scripts/zk-shortkey-tool.ps1`
- Create: `scripts/tests/test_zk_shortkey_tool.ps1` or `scripts/tests/test_zk_shortkey_tool.py`
- Modify: `src/main/services/notification-service.ts`
- Modify: `src/main/services/__tests__/notification-service.test.ts`
- Optional Create: `src/main/services/notification-inout.ts`

## Chunk 1: ZK Shortkey Prototype

### Task 1: Lock Down Tool Contract

**Files:**
- Create: `scripts/tests/test_zk_shortkey_tool.py`
- Create: `scripts/zk-shortkey-tool.ps1`

- [ ] **Step 1: Write the failing test for CLI parsing and JSON shape**

Add tests that exercise:
- `get` mode returns `deviceIp`, `deviceName`, `shortKeys`
- `set` mode requires `shortKeyId`, `stateCode`, `stateName`, `autoChange`, `autoChangeTime`
- invalid command or missing args fails clearly

Suggested test skeleton:

```python
def test_get_command_outputs_expected_shape():
    result = run_tool_with_fakes(["get"])
    assert result["deviceIp"] == "10.60.1.5"
    assert result["shortKeys"][0]["shortKeyId"] == 1
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m unittest scripts/tests/test_zk_shortkey_tool.py`

Expected: FAIL because `scripts/zk-shortkey-tool.ps1` does not exist or contract helpers are missing.

- [ ] **Step 3: Write the minimal PowerShell tool structure**

Implement:
- arg parsing for `get` and `set`
- helper to emit JSON
- placeholder COM boundary functions:
  - `Connect-Device`
  - `Get-ShortKey`
  - `Set-ShortKey`

Keep the script structured so COM calls sit in one small block and the JSON mapping is separate.

- [ ] **Step 4: Re-run the contract test**

Run: `python -m unittest scripts/tests/test_zk_shortkey_tool.py`

Expected: PASS for shape/parse tests using fakes or isolated logic.

- [ ] **Step 5: Commit**

```bash
git add scripts/zk-shortkey-tool.ps1 scripts/tests/test_zk_shortkey_tool.py
git commit -m "feat: add zk shortkey prototype tool contract"
```

### Task 2: Implement COM Read Path

**Files:**
- Modify: `scripts/zk-shortkey-tool.ps1`
- Modify: `scripts/tests/test_zk_shortkey_tool.py`

- [ ] **Step 1: Write the failing test for `get` mode mapping**

Test that the tool maps one COM-returned shortkey record into JSON fields:
- `shortKeyFun`
- `stateCode`
- `stateName`
- `autoChange`
- `autoChangeTime`

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m unittest scripts/tests/test_zk_shortkey_tool.py`

Expected: FAIL because real COM-to-JSON mapping is not implemented yet.

- [ ] **Step 3: Implement the read path**

Add:
- COM object creation through `zkemkeeper.ZKEM`
- device connect routine
- loop across `ShortKeyID = 1..4`
- call into `SSR_GetShortkey`
- JSON serialization

Handle Windows-only failure cases clearly:
- COM object not registered
- connect failure
- unsupported API call

- [ ] **Step 4: Run the tests again**

Run: `python -m unittest scripts/tests/test_zk_shortkey_tool.py`

Expected: PASS.

- [ ] **Step 5: Smoke-test on the real device in read-only mode**

Run:

```powershell
powershell -File scripts/zk-shortkey-tool.ps1 get --ip 10.60.1.5 --port 4370 --password 938948
```

Expected:
- JSON output
- `deviceName` present
- F1..F4 shortkey records returned or explicit "unsupported" error

- [ ] **Step 6: Commit**

```bash
git add scripts/zk-shortkey-tool.ps1 scripts/tests/test_zk_shortkey_tool.py
git commit -m "feat: add zk shortkey read support"
```

### Task 3: Implement COM Write Path And Restore Workflow

**Files:**
- Modify: `scripts/zk-shortkey-tool.ps1`
- Modify: `scripts/tests/test_zk_shortkey_tool.py`

- [ ] **Step 1: Write the failing test for `set` mode**

Test that:
- the tool validates all required write args
- the tool calls the write function with the right values
- the tool returns updated JSON or a write acknowledgement

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m unittest scripts/tests/test_zk_shortkey_tool.py`

Expected: FAIL because the write path is not implemented yet.

- [ ] **Step 3: Implement `SSR_SetShortkey` write path**

Add:
- arg validation
- COM write call
- follow-up read to confirm the updated shortcut key config

Preserve a simple structure:
- `Set-ShortKey`
- `Get-ShortKey`
- `Invoke-Get`
- `Invoke-Set`

- [ ] **Step 4: Re-run the tests**

Run: `python -m unittest scripts/tests/test_zk_shortkey_tool.py`

Expected: PASS.

- [ ] **Step 5: Verify against the real device with a reversible config**

1. Run `get` and save F1 config
2. Run `set` on one key with a test `StateAutoChangeTime`
3. Run `get` again
4. Verify on the device screen
5. Restore the original config

Document the exact commands and observed output in the commit message or a short note.

- [ ] **Step 6: Commit**

```bash
git add scripts/zk-shortkey-tool.ps1 scripts/tests/test_zk_shortkey_tool.py
git commit -m "feat: add zk shortkey write support"
```

## Chunk 2: Notification Schedule/InOut Refactor

### Task 4: Add Failing Tests For Schedule-Driven Classification

**Files:**
- Modify: `src/main/services/__tests__/notification-service.test.ts`

- [ ] **Step 1: Write a failing test for late detection when all punches are raw `I`**

Example scenario:
- schedule uses in/out windows
- punches all have `type: 'I'`
- first morning punch in the first `In` window is late
- notification should still be `late`

- [ ] **Step 2: Write a failing test for missing checkout based on last `Out` window**

Example scenario:
- morning and midday punches exist
- no punch falls into the final `Out` window
- after grace time, notification should be `missing-checkout`

- [ ] **Step 3: Write a failing test for per-day schedule resolution**

Example scenario:
- two days in the range
- each day returns a different shift/inout config
- notification logic must not reuse one "today shift" for both days

- [ ] **Step 4: Run the test file to verify it fails**

Run:

```bash
npm test -- src/main/services/__tests__/notification-service.test.ts
```

Expected: FAIL due to missing repository shape / missing schedule-driven logic.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/__tests__/notification-service.test.ts
git commit -m "test: cover schedule-driven notification classification"
```

### Task 5: Extend Repository Contract For InOut Metadata

**Files:**
- Modify: `src/main/services/notification-service.ts`
- Modify: `src/main/services/__tests__/notification-service.test.ts`

- [ ] **Step 1: Update the repository interface in the code and tests**

Add types for:
- per-date shift/inout config
- in/out windows

Keep naming plain:
- `NotificationDayConfig`
- `NotificationInOutWindow`

- [ ] **Step 2: Run the tests to verify they still fail for the right reason**

Run:

```bash
npm test -- src/main/services/__tests__/notification-service.test.ts
```

Expected: FAIL in service behavior, not due to type mismatches.

- [ ] **Step 3: Implement SQL query support for schedule/inout metadata**

The repository should:
- resolve the user's schedule for each date
- fetch `InOutArr`
- fetch `InOut`
- return the config grouped by day or by `InOutID`

Do not overengineer. Prefer a compact query path that returns only fields the notification service needs.

- [ ] **Step 4: Re-run the tests**

Run:

```bash
npm test -- src/main/services/__tests__/notification-service.test.ts
```

Expected: still FAIL on classification behavior, but repository shape now supports the next step.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/notification-service.ts src/main/services/__tests__/notification-service.test.ts
git commit -m "feat: add notification inout schedule repository data"
```

### Task 6: Implement Time-Window Classification

**Files:**
- Create: `src/main/services/notification-inout.ts`
- Modify: `src/main/services/notification-service.ts`
- Modify: `src/main/services/__tests__/notification-service.test.ts`

- [ ] **Step 1: Write a focused failing unit test for the classifier helper**

Add tests for:
- first valid arrival punch from `StartIn/EndIn`
- final valid checkout punch from final `StartOut/EndOut`
- ignore wrong raw `OriginType` when time window is authoritative

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- src/main/services/__tests__/notification-service.test.ts
```

Expected: FAIL because the classifier helper does not exist yet.

- [ ] **Step 3: Implement the minimal classifier helper**

Suggested responsibility for `notification-inout.ts`:
- normalize a day's windows
- match punches to arrival/out windows
- return:
  - `firstArrivalPunch`
  - `finalCheckoutPunch`

Keep this file pure and synchronous so tests stay cheap.

- [ ] **Step 4: Wire the classifier into `NotificationService`**

Replace:
- `getFirstCheckIn`
- `lastPunch.type === 'I'`

Use:
- schedule-config-driven classification results

Keep `OriginType` only as a fallback if config is missing.

- [ ] **Step 5: Re-run the notification tests**

Run:

```bash
npm test -- src/main/services/__tests__/notification-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/notification-inout.ts src/main/services/notification-service.ts src/main/services/__tests__/notification-service.test.ts
git commit -m "feat: classify notifications from schedule inout windows"
```

### Task 7: Verify Real Notification Behavior Against Live WiseEye Data

**Files:**
- Modify: `src/main/services/notification-service.ts` if needed
- Modify: `src/main/services/__tests__/notification-service.test.ts` if new edge cases are discovered

- [ ] **Step 1: Run the targeted notification test suite**

Run:

```bash
npm test -- src/main/services/__tests__/notification-service.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run one live inspection query against WiseEye**

Verify:
- target users map to `Schedule.InOutID`
- `InOutArr` and `InOut` windows match expected business rules
- new logic assumptions are correct for schedule `Hành chánh`

- [ ] **Step 3: If an edge case appears, add a regression test first**

Add only the minimal extra case discovered from live data.

- [ ] **Step 4: Re-run tests after the regression case**

Run:

```bash
npm test -- src/main/services/__tests__/notification-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/notification-service.ts src/main/services/__tests__/notification-service.test.ts
git commit -m "test: verify notification windows against live wiseeye config"
```

## Chunk 3: Completion Gate

### Task 8: Final Verification

**Files:**
- No new files required unless fixes are found

- [ ] **Step 1: Run Python tool tests**

Run:

```bash
python -m unittest scripts/tests/test_zk_shortkey_tool.py
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript notification tests**

Run:

```bash
npm test -- src/main/services/__tests__/notification-service.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run one final device read**

Run:

```powershell
powershell -File scripts/zk-shortkey-tool.ps1 get --ip 10.60.1.5 --port 4370 --password 938948
```

Expected:
- valid JSON
- original shortcut config preserved unless intentionally changed for testing

- [ ] **Step 4: Review changed files**

Confirm:
- tool remains Windows-only and isolated
- notification logic no longer requires raw `OriginType` for primary classification
- no unrelated refactors slipped in

- [ ] **Step 5: Final commit**

```bash
git add scripts/zk-shortkey-tool.ps1 scripts/tests/test_zk_shortkey_tool.py src/main/services/notification-inout.ts src/main/services/notification-service.ts src/main/services/__tests__/notification-service.test.ts
git commit -m "feat: add zk shortkey prototype and schedule-based notifications"
```
