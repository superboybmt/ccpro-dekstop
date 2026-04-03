# Portable No-Admin Runtime Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the packaged portable app self-stage all runtime artifacts into `%APPDATA%` and keep Admin machine-config working on copied machines without requiring Administrator rights.

**Architecture:** Add a small runtime artifact manager in Electron main, route packaged helper launches through staged AppData paths, update `machine-config-helper.exe` to stage its embedded SDK payload into a stable directory, and replace machine-wide COM registration with per-user COM registration for `zkemkeeper.dll`.

**Tech Stack:** Electron main process, TypeScript, Python, PowerShell, Windows per-user COM registry, PyInstaller, Vitest, Python unittest

---

## Chunk 1: Runtime Artifact Staging In AppData

### Task 1: Add a runtime artifact manager for packaged mode

**Files:**
- Create: `src/main/runtime/runtime-artifact-manager.ts`
- Create: `src/main/runtime/__tests__/runtime-artifact-manager.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/services/machine-config-service.ts`
- Modify: `src/main/services/device-sync-service.ts`
- Test: `src/main/services/__tests__/device-sync-service.test.ts`
- Test: `src/main/services/__tests__/machine-config-service.test.ts`

- [ ] **Step 1: Write the failing runtime manager tests**

Add tests that expect:
- packaged mode stages helper, worker, and seed files into `%APPDATA%`
- missing staged files are recopied
- staged paths are version-scoped
- packaged services launch from the staged AppData path instead of `process.resourcesPath`

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/main/runtime/__tests__/runtime-artifact-manager.test.ts src/main/services/__tests__/device-sync-service.test.ts src/main/services/__tests__/machine-config-service.test.ts
```

Expected:
- FAIL because no runtime artifact manager exists yet
- packaged path assertions still point at `process.resourcesPath`

- [ ] **Step 3: Implement the runtime artifact manager**

Create a focused module that:
- resolves `%APPDATA%/ccpro-desktop/runtime/<version>/`
- knows the source packaged artifact paths
- hashes files and copies when needed
- returns resolved staged paths

Keep development mode behavior unchanged.

- [ ] **Step 4: Wire packaged services to the staged paths**

Update:
- `src/main/index.ts` to prepare artifacts during startup
- `machine-config-service.ts` to use the staged helper path
- `device-sync-service.ts` to use the staged worker path

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npx vitest run src/main/runtime/__tests__/runtime-artifact-manager.test.ts src/main/services/__tests__/device-sync-service.test.ts src/main/services/__tests__/machine-config-service.test.ts
```

Expected: PASS

## Chunk 2: Stable Helper Payload Extraction

### Task 2: Stage embedded SDK payload into a stable helper runtime directory

**Files:**
- Modify: `scripts/machine-config-helper.py`
- Modify: `scripts/tests/test_machine_config_helper.py`

- [ ] **Step 1: Write the failing helper payload tests**

Add tests that expect:
- packaged mode resolves a stable runtime root from `sys.executable`
- embedded SDK/script payload can be copied from `_MEIPASS` into the stable runtime directory
- `sdk_dir_path()` and `ssr_tool_path()` return staged paths in packaged mode

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
python -m unittest scripts.tests.test_machine_config_helper
```

Expected: FAIL because helper still points directly at `_MEIPASS`

- [ ] **Step 3: Implement stable payload staging**

Update the helper so packaged mode:
- detects a stable runtime directory next to `sys.executable`
- stages embedded `sdk/` and `scripts/zk-ssr-device-data-tool.ps1`
- uses the staged payload after extraction

Keep repo-relative paths for development mode.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
python -m unittest scripts.tests.test_machine_config_helper
```

Expected: PASS

## Chunk 3: No-Admin COM Registration

### Task 3: Replace machine-wide COM registration with per-user registration

**Files:**
- Modify: `scripts/zk-ssr-device-data-tool.ps1`
- Modify: `scripts/__tests__/script-security.test.ts`
- Optionally create: `scripts/tests/test_zk_ssr_device_data_tool.ps1` or targeted TypeScript assertions if PowerShell unit coverage stays shell-based
- Modify: `src/main/services/__tests__/machine-config-service.test.ts`

- [ ] **Step 1: Write the failing no-admin tests**

Add coverage that expects:
- preflight no longer instructs the user to run as Administrator
- COM bootstrap uses current-user registration semantics
- failure messages mention per-user registration/bootstrap instead of `regsvr32`

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/main/services/__tests__/machine-config-service.test.ts scripts/__tests__/script-security.test.ts
```

Expected: FAIL because current error expectations still mention Administrator/`regsvr32`

- [ ] **Step 3: Implement per-user COM registration**

Update the PowerShell tool so it:
- writes the required ProgID/CLSID/InprocServer32 keys into `HKCU\Software\Classes`
- points `InprocServer32` at the staged `zkemkeeper.dll`
- sets `ThreadingModel=Apartment`
- verifies COM activation immediately
- never attempts machine-wide `regsvr32`

Preserve 32-bit host validation through SysWOW64 PowerShell.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run src/main/services/__tests__/machine-config-service.test.ts scripts/__tests__/script-security.test.ts
```

Expected: PASS

## Chunk 4: Startup Integration And Runtime Self-Heal

### Task 4: Prepare runtime artifacts during startup before services begin

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/startup.ts`
- Create or modify: `src/main/__tests__/startup-runtime-artifacts.test.ts`
- Modify: `src/main/__tests__/startup.test.ts`

- [ ] **Step 1: Write the failing startup tests**

Add tests that expect:
- startup prepares runtime artifacts before DB init
- packaged startup can continue when staged artifacts are missing locally
- artifact staging failures surface as startup errors

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/main/__tests__/startup-runtime-artifacts.test.ts src/main/__tests__/startup.test.ts
```

Expected: FAIL because startup does not yet prepare artifact state

- [ ] **Step 3: Implement startup integration**

Update startup wiring so:
- config bootstrap still happens first
- runtime artifact staging happens next
- DB init and background services run only after both succeed

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run src/main/__tests__/startup-runtime-artifacts.test.ts src/main/__tests__/startup.test.ts
```

Expected: PASS

## Chunk 5: Live Runtime Validation

### Task 5: Rebuild helpers and verify no-admin runtime behavior against the real device

**Files:**
- Modify: `scripts/build-machine-config-helper.ps1`
- Optionally modify: `package.json`
- Optionally modify: `docs/reports/production-go-live-checklist.md`

- [ ] **Step 1: Rebuild the helper and worker artifacts**

Run:

```bash
npm run build:machine-config-helper
npm run build:device-sync-worker
```

Expected:
- both build commands succeed
- staged build artifacts are present in `build/machine-config/` and `build/device-sync/`

- [ ] **Step 2: Run the focused automated test suite**

Run:

```bash
npx vitest run src/main/runtime/__tests__/runtime-artifact-manager.test.ts src/main/__tests__/startup-runtime-artifacts.test.ts src/main/services/__tests__/machine-config-service.test.ts src/main/services/__tests__/device-sync-service.test.ts
python -m unittest scripts.tests.test_machine_config_helper
```

Expected: PASS

- [ ] **Step 3: Run encoding checks before completion**

Run:

```bash
npm run check:encoding
npm run test:encoding
```

Expected: PASS

- [ ] **Step 4: Verify against the real `8000T` device**

Run live checks:
- read state mode
- run helper preflight
- run `get-config`
- run `sync-time`

Expected:
- all commands succeed without elevation
- helper resolves staged AppData runtime

- [ ] **Step 5: Build the packaged artifact**

Run:

```bash
npm run build:portable
```

Expected:
- build succeeds
- packaged artifact is created

- [ ] **Step 6: Update rollout evidence if needed**

Record the verification evidence in the go-live checklist or follow-up report.

