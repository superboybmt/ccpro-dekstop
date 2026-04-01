# Device Sync Runtime Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle the ZKTeco sync worker as a self-contained Windows executable so packaged builds can sync attendance without requiring Python or `pyzk` on the target machine.

**Architecture:** Keep the existing `DeviceSyncWorker` interface in Electron main, but replace the packaged execution path from `python device-sync-worker.py` to a bundled `device-sync-worker.exe`. Build the worker separately with pinned Python dependencies, ship it through `electron-builder` resources, and keep the current script-based fallback for local development.

**Tech Stack:** Electron, TypeScript, PowerShell, PyInstaller, Python 3.x, `pyzk`, Vitest, electron-builder

---

## File Map

- Create: `scripts/requirements-device-sync.txt`
  Purpose: Pin Python dependencies required to build the worker binary.
- Create: `scripts/build-device-sync-worker.ps1`
  Purpose: Build a clean, repeatable Windows worker executable and stage it for packaging.
- Create: `scripts/device-sync-worker.spec`
  Purpose: PyInstaller spec describing the single-file worker build.
- Modify: `package.json`
  Purpose: Add build hooks/scripts so the worker binary is produced before Electron packaging.
- Modify: `src/main/services/device-sync-service.ts`
  Purpose: Resolve and spawn the bundled `.exe` in packaged Windows builds while preserving dev fallback.
- Modify: `src/main/services/__tests__/device-sync-service.test.ts`
  Purpose: Lock the runtime resolution behavior and packaged worker path.
- Modify: `openspec/changes/desktop-attendance-app/tasks.md`
  Purpose: Track the runtime bundling work as part of the device-sync rollout.

## Chunk 1: Bundle Strategy and Runtime Resolution

### Task 1: Lock runtime resolution behavior with tests

**Files:**
- Modify: `src/main/services/__tests__/device-sync-service.test.ts`
- Modify: `src/main/services/device-sync-service.ts`

- [ ] **Step 1: Write the failing test**

Add focused tests for the worker launcher:

```ts
it('prefers bundled worker executable in packaged Windows builds', () => {
  // app.isPackaged = true
  // process.platform = 'win32'
  // expect resolved path to be process.resourcesPath/device-sync/device-sync-worker.exe
})

it('falls back to script-based worker in development', () => {
  // app.isPackaged = false
  // expect resolved command/path to use scripts/device-sync-worker.py
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/main/services/__tests__/device-sync-service.test.ts`
Expected: FAIL because the current worker only resolves `.py` and requires external Python.

- [ ] **Step 3: Implement minimal runtime resolution**

Refactor `PythonDeviceSyncWorker` into a launcher that:
- uses `device-sync-worker.exe` when `app.isPackaged && process.platform === 'win32'`
- keeps `python scripts/device-sync-worker.py` fallback in development
- surfaces a clear error when the packaged `.exe` is missing

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/main/services/__tests__/device-sync-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/device-sync-service.ts src/main/services/__tests__/device-sync-service.test.ts
git commit -m "test: lock bundled device sync runtime resolution"
```

## Chunk 2: Build the Self-Contained Worker

### Task 2: Add reproducible Python build inputs

**Files:**
- Create: `scripts/requirements-device-sync.txt`
- Create: `scripts/device-sync-worker.spec`

- [ ] **Step 1: Write the failing build assumption down**

Document in the files that:
- the worker depends on `pyzk`
- the build must produce `device-sync-worker.exe`
- the output must be deterministic enough for packaging

Use a pinned dependency file:

```txt
pyzk==0.9
pyinstaller==6.16.0
```

Use a PyInstaller spec that points to `scripts/device-sync-worker.py` and emits a single console-less executable named `device-sync-worker`.

- [ ] **Step 2: Run a dry build command to verify it fails before script exists**

Run: `powershell -File scripts/build-device-sync-worker.ps1`
Expected: FAIL because the build script does not exist yet.

- [ ] **Step 3: Add the spec and pinned dependency inputs**

Create:
- `scripts/requirements-device-sync.txt`
- `scripts/device-sync-worker.spec`

Keep the spec minimal:
- one entry script
- one executable
- no hidden imports unless build output proves they are required

- [ ] **Step 4: Commit**

```bash
git add scripts/requirements-device-sync.txt scripts/device-sync-worker.spec
git commit -m "build: add device sync worker build inputs"
```

### Task 3: Add a Windows build script for the worker

**Files:**
- Create: `scripts/build-device-sync-worker.ps1`

- [ ] **Step 1: Write the build script behavior**

The script should:
- create a local venv under `.cache/device-sync-python` or similar repo-local path
- install from `scripts/requirements-device-sync.txt`
- run `pyinstaller scripts/device-sync-worker.spec`
- copy the resulting `device-sync-worker.exe` into a stable staging folder such as `build/device-sync/`

- [ ] **Step 2: Run the script to verify it builds the executable**

Run: `powershell -ExecutionPolicy Bypass -File scripts/build-device-sync-worker.ps1`
Expected: PASS and produce `build/device-sync/device-sync-worker.exe`

- [ ] **Step 3: Verify the built worker runs standalone**

Run a smoke test using JSON payload:

```powershell
build\device-sync\device-sync-worker.exe '{"deviceIp":"10.60.1.5","devicePort":4370,"devicePassword":938948,"bootstrapDays":1,"lastLogUid":1,"lastLogTime":"2026-03-31T00:00:00","lastDeviceRecordCount":999999}'
```

Expected: JSON response with `"ok": true`

- [ ] **Step 4: Commit**

```bash
git add scripts/build-device-sync-worker.ps1 build/device-sync/.gitkeep
git commit -m "build: add self-contained device sync worker build script"
```

## Chunk 3: Package the Worker with Electron

### Task 4: Wire worker build into packaging

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add build scripts**

Add scripts such as:

```json
{
  "build:device-sync-worker": "powershell -ExecutionPolicy Bypass -File scripts/build-device-sync-worker.ps1",
  "build": "npm run build:device-sync-worker && electron-vite build && electron-builder",
  "build:dir": "npm run build:device-sync-worker && electron-vite build && electron-builder --dir"
}
```

- [ ] **Step 2: Update `extraResources`**

Replace the raw `.py` resource with:

```json
{
  "from": "build/device-sync/device-sync-worker.exe",
  "to": "device-sync/device-sync-worker.exe"
}
```

Optional: keep the `.py` script only if it is still useful for diagnostics, but do not rely on it at runtime.

- [ ] **Step 3: Run packaging build**

Run: `npm run build`
Expected: PASS and package `resources/device-sync/device-sync-worker.exe`

- [ ] **Step 4: Verify packaged artifact contents**

Run:

```powershell
Get-ChildItem release\win-unpacked\resources\device-sync
```

Expected: `device-sync-worker.exe` present

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: package bundled device sync worker"
```

## Chunk 4: End-to-End Verification

### Task 5: Verify packaged runtime no longer depends on system Python

**Files:**
- Modify: `openspec/changes/desktop-attendance-app/tasks.md`

- [ ] **Step 1: Verify packaged app can resolve the worker**

Launch the packaged app from `release/win-unpacked` and trigger `Dong bo lai`.
Expected: no error mentioning missing `python`, `py`, or `pyzk`.

- [ ] **Step 2: Verify real sync still reaches SQL**

Use the existing controlled verification flow:
- fetch a narrow batch from device
- trigger retry
- query `WiseEye.dbo.CheckInOut`

Expected: imported `FP` rows appear in SQL as before.

- [ ] **Step 3: Update OpenSpec task tracking**

Mark the runtime-bundling work complete in:
- `openspec/changes/desktop-attendance-app/tasks.md`

- [ ] **Step 4: Run final regression suite**

Run:

```bash
npm test
npm run build
```

Expected: both PASS

- [ ] **Step 5: Commit**

```bash
git add openspec/changes/desktop-attendance-app/tasks.md release
git commit -m "feat: bundle device sync runtime for windows"
```

## Notes for the Implementer

- Keep the current dev experience intact. In repo-local development, script fallback is still useful.
- Do not mix Python environment management into Electron runtime code. Build-time concern only.
- Prefer one executable over shipping an embedded Python folder tree. Smaller mental model, fewer runtime path bugs.
- If PyInstaller reveals hidden imports for `pyzk`, add only the missing modules proven by build output.
