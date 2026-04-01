# Machine Config Helper Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct `ps1`/`python` invocations in machine configuration with a packaged `machine-config-helper.exe` that the Electron app can ship and call safely on other Windows machines.

**Architecture:** Keep the current ZKTeco logic and verified SSR write path, but move it behind a dedicated helper executable with a stable JSON CLI contract. The Electron main process will call only the helper binary, while packaging will include that binary as an extra resource resolved from `process.resourcesPath`.

**Tech Stack:** Electron main process, TypeScript, PowerShell/COM bridge inside helper build, Electron Builder extraResources, Vitest

---

## Chunk 1: Helper Contract And Build Target

### Task 1: Define helper CLI contract and runtime path helpers

**Files:**
- Modify: `src/main/services/machine-config-service.ts`
- Modify: `src/main/config/app-config.ts`
- Create: `scripts/machine-config-helper.ps1`
- Create: `scripts/build-machine-config-helper.ps1`

- [ ] **Step 1: Write the failing test for helper invocation contract**

Add a test file or expand `src/main/services/__tests__/machine-config-service.test.ts` to expect:
- app calls a single helper executable
- helper returns JSON for `get-config` / `save-config`
- app no longer calls raw `zk-state-mode.py` or `zk-ssr-device-data-tool.ps1`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/main/services/__tests__/machine-config-service.test.ts`
Expected: FAIL because service still invokes script-specific commands

- [ ] **Step 3: Add helper path resolution and CLI schema**

Implement:
- `resolveMachineConfigHelperPath()`
- dev path fallback to staged helper under `build/machine-config/`
- packaged path under `process.resourcesPath`
- helper subcommands:
  - `get-config`
  - `save-config`

- [ ] **Step 4: Create helper wrapper script**

Create `scripts/machine-config-helper.ps1` that:
- accepts JSON-safe CLI args
- delegates to existing verified ZK logic
- prints JSON to stdout
- exits non-zero on failure

- [ ] **Step 5: Add helper build script**

Create `scripts/build-machine-config-helper.ps1` to stage:
- `build/machine-config/machine-config-helper.exe`

Start with the simplest reliable packaging path, even if the helper internally hosts PowerShell logic.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/main/services/__tests__/machine-config-service.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/services/__tests__/machine-config-service.test.ts src/main/services/machine-config-service.ts src/main/config/app-config.ts scripts/machine-config-helper.ps1 scripts/build-machine-config-helper.ps1
git commit -m "feat: add machine config helper contract"
```

## Chunk 2: Move ZK Machine Config Operations Behind Helper

### Task 2: Route read/write config flows through helper JSON

**Files:**
- Modify: `src/main/services/machine-config-service.ts`
- Reuse: `scripts/zk-state-mode.py`
- Reuse: `scripts/zk-ssr-device-data-tool.ps1`

- [ ] **Step 1: Write failing tests for `getConfig()` and `saveConfig()` through helper**

Cover:
- `getConfig()` reads helper JSON and maps `stateMode + schedule`
- `saveConfig()` sends a single `save-config` payload and uses helper readback result

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/main/services/__tests__/machine-config-service.test.ts`
Expected: FAIL because service still owns low-level orchestration itself

- [ ] **Step 3: Implement minimal helper-backed service**

Refactor `machine-config-service.ts`:
- replace per-script execution with helper execution
- keep DB audit logging in main process
- keep `DeviceConfigResult` shape stable for renderer

- [ ] **Step 4: Keep current SSR row-building logic either in helper or a shared internal contract**

Do not regress:
- state order `0,2,3,1`
- SSR write path for `state2/state3`
- business-level readback verification

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/main/services/__tests__/machine-config-service.test.ts src/main/services/__tests__/notification-service.test.ts src/main/services/__tests__/device-sync-repository.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/services/machine-config-service.ts src/main/services/__tests__/machine-config-service.test.ts
git commit -m "refactor: route machine config through helper"
```

## Chunk 3: Package Helper With The Desktop App

### Task 3: Ship helper as an app resource

**Files:**
- Modify: `package.json`
- Modify: `scripts/build-machine-config-helper.ps1`
- Modify: any startup/runtime path helper files needed by packaging

- [ ] **Step 1: Write the failing test or verification checklist for packaged helper resolution**

If automated packaging tests are too heavy, add a focused unit test for path resolution plus a manual verification checklist in code comments or plan notes.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/main/services/__tests__/machine-config-service.test.ts`
Expected: FAIL or missing packaged path behavior

- [ ] **Step 3: Add helper to Electron Builder resources**

Update `package.json`:
- build helper before Electron packaging
- ship `build/machine-config/machine-config-helper.exe` via `extraResources`

- [ ] **Step 4: Update runtime path resolution**

Ensure:
- dev uses staged build path
- packaged app uses `process.resourcesPath`

- [ ] **Step 5: Run verification**

Run:
- `npm run build`

Expected:
- build succeeds
- packaged resources include `machine-config-helper.exe`

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/build-machine-config-helper.ps1 src/main/services/machine-config-service.ts
git commit -m "build: package machine config helper"
```

## Chunk 4: End-To-End Verification On Real Device

### Task 4: Verify helper flow on the real `8000T`

**Files:**
- No required source changes unless defects are found

- [ ] **Step 1: Run helper directly for read path**

Run helper `get-config` against `10.60.1.5:4370`
Expected: JSON includes current `stateMode` and four schedule rows

- [ ] **Step 2: Run helper directly for save path**

Save a controlled config change:
- one schedule time
- or one mode change with immediate revert

Expected:
- helper returns `before`, `after`, `ok`
- device readback matches

- [ ] **Step 3: Verify from the Electron app**

Open Admin UI:
- load config
- change one time
- save
- confirm UI shows readback values, not defaults

- [ ] **Step 4: Verify on a second Windows machine if available**

Expected:
- app can save machine config without direct PowerShell/Python dependencies exposed at app level

- [ ] **Step 5: Commit final integration fixes if any**

```bash
git add .
git commit -m "test: verify machine config helper integration"
```
