# Portable No-Admin Runtime Design

**Date:** 2026-04-03

**Status:** Drafted from live device data and current codebase behavior

## Goal

Make the portable desktop app run on a copied Windows machine with full User and Admin functionality, without requiring local Administrator rights.

## Live Baseline

The design is based on real data read from the current deployment using the existing repo tooling:

- device IP: `10.60.1.5`
- device port: `4370`
- device name: `8000T`
- current `StateMode`: `2`
- current SSR auto-switch schedule:
  - `state0`: `07:00`
  - `state2`: `11:30`
  - `state3`: `12:30`
  - `state1`: `17:00`

These values were read successfully through:

- `scripts/zk-state-mode.py`
- `build/machine-config/machine-config-helper.exe get-config`

## Current Problem

The app is already close to portable for normal user flows:

- runtime config can bootstrap into `%APPDATA%/ccpro-desktop/config.json`
- `device-sync-worker.exe` is bundled
- `machine-config-helper.exe` is bundled

The remaining portability gap is Admin machine configuration.

Today, the Admin path depends on:

- `machine-config-helper.exe`
- `scripts/zk-ssr-device-data-tool.ps1`
- `zkemkeeper.dll` 32-bit COM activation

The current script tries to auto-register `zkemkeeper.dll` with `regsvr32`, which can require Administrator rights on a fresh machine. That breaks the required deployment model.

## Non-Negotiable Constraints

- No local Administrator rights may be required at first launch or later.
- User flows and Admin flows must keep working after the portable app is copied to another machine.
- The app must self-heal missing runtime artifacts instead of relying on manual side-loading.
- Device sync and machine-config helpers must not depend on Python, PowerShell profiles, or machine-global SDK installation.
- The design must preserve the currently proven behavior on the real `8000T` device.

## Options Considered

### Option 1: Keep machine-wide COM registration

Keep `regsvr32` and require one elevated bootstrap on each new machine.

**Pros**

- Smallest code change
- Keeps current helper path almost intact

**Cons**

- Fails the explicit requirement
- Not truly portable
- Support burden stays high

### Option 2: Rewrite the full SSR path without COM

Replace all `SSR_*DeviceData` operations with a fully user-space protocol implementation.

**Pros**

- Clean long-term architecture
- No COM dependency at all

**Cons**

- Highest risk and largest implementation cost
- Hard to prove parity quickly against the current `8000T`
- Not necessary if a no-admin SDK path already exists

### Option 3: Stable AppData runtime + per-user COM registration

Stage runtime artifacts into `%APPDATA%`, then register `zkemkeeper.dll` in the current user's COM configuration store instead of machine-wide registry.

**Pros**

- Meets the no-admin requirement
- Preserves the currently working SDK-backed Admin feature set
- Requires less protocol rework than a full SSR rewrite
- Gives a stable runtime home for all portable artifacts

**Cons**

- Still depends on the vendor DLL
- Requires careful staging and registry repair logic
- Must be validated against the real device and on a clean Windows profile

## Recommended Approach

Use **Option 3**.

The app will own a stable runtime home under `%APPDATA%/ccpro-desktop/runtime/<app-version>/` and treat packaged resources only as the source-of-truth payload to copy from.

For Admin machine config:

1. The packaged helper executable is copied into the stable runtime directory.
2. The helper stages its embedded SDK payload and PowerShell script into stable sibling folders under the same runtime directory.
3. The PowerShell SSR tool ensures `zkemkeeper.dll` is registered in the **current user's** COM registry view, not machine-wide.
4. The existing `New-Object -ComObject 'zkemkeeper.ZKEM'` path then runs without Administrator rights.

For User/device sync:

1. `device-sync-worker.exe` is also staged into the stable runtime directory.
2. Device sync always launches from the staged AppData path in packaged mode.

This makes the runtime deterministic across copied portable launches and avoids depending on temporary extraction locations.

## Architecture

### 1. Portable runtime manager in Electron main

Add a small runtime manager responsible for:

- resolving the stable runtime root under `%APPDATA%`
- copying packaged artifacts from `process.resourcesPath` to the stable root
- hashing source and destination artifacts
- repairing missing or corrupted staged artifacts
- returning stable executable and seed paths to the rest of main process

Initial staged artifacts:

- `machine-config-helper.exe`
- `device-sync-worker.exe`
- `bootstrap/app-config.seed.json`

Expected layout:

```text
%APPDATA%/ccpro-desktop/
  config.json
  runtime/
    1.0.3/
      manifest.json
      machine-config/
        machine-config-helper.exe
        sdk/
          zkemkeeper.dll
          ...
        scripts/
          zk-ssr-device-data-tool.ps1
      device-sync/
        device-sync-worker.exe
      bootstrap/
        app-config.seed.json
```

### 2. Stable helper payload staging

`machine-config-helper.exe` currently reads embedded payload from the PyInstaller extraction directory.

That extraction directory is not stable enough for COM registration.

The helper will be updated so that in packaged mode it:

- detects its stable executable directory
- copies embedded `sdk/` and `scripts/zk-ssr-device-data-tool.ps1` from `_MEIPASS` into that stable directory if missing or outdated
- resolves `sdkDir` and `ssrToolPath` from the stable directory afterward

Development mode keeps using the repo paths.

### 3. Per-user COM registration instead of `regsvr32`

The SSR PowerShell tool will stop trying to register `zkemkeeper.dll` machine-wide.

Instead it will:

- register the ProgID and CLSID under `HKCU\Software\Classes`
- write `InprocServer32` to the staged `%APPDATA%` copy of `zkemkeeper.dll`
- set `ThreadingModel=Apartment`
- verify COM activation immediately afterward

Relevant Microsoft behavior:

- `HKEY_CLASSES_ROOT` is a merged view of `HKCU\Software\Classes` and `HKLM\Software\Classes`
- per-user COM configuration is supported for non-elevated applications
- non-elevated apps can depend on per-user COM registration without touching machine-wide registry

This keeps the feature in user space and avoids elevation prompts.

### 4. Main-process service resolution

`machine-config-service.ts` and `device-sync-service.ts` will stop launching packaged helpers directly from `process.resourcesPath`.

Instead they will resolve staged paths from the runtime manager.

Packaged-mode launch rules become:

- machine config helper: `%APPDATA%/.../runtime/<version>/machine-config/machine-config-helper.exe`
- device sync worker: `%APPDATA%/.../runtime/<version>/device-sync/device-sync-worker.exe`

Development mode still uses the existing `build/` or script paths.

### 5. Startup sequencing

Startup will prepare two kinds of runtime state before the app begins normal work:

1. config state
2. artifact state

Order:

1. ensure local config exists
2. stage runtime artifacts into AppData
3. refresh app config
4. initialize DB
5. let services start

This guarantees both User and Admin paths have the binaries they need on a copied machine.

## Error Handling

Add clear runtime failure categories for:

- missing staged artifact
- staged artifact hash mismatch / copy failure
- per-user COM bootstrap failure
- device connectivity failure
- SQL/config bootstrap failure

Admin UI should show the exact helper failure rather than collapsing it into a generic connection error.

## Testing Strategy

### Automated

Add or update tests for:

- runtime manager stages packaged artifacts into `%APPDATA%`
- missing staged artifacts are recopied automatically
- packaged services resolve AppData runtime paths instead of `process.resourcesPath`
- helper stages embedded SDK/script payload into its stable directory
- SSR tool registers per-user COM keys instead of requiring admin
- existing machine-config service tests still cover `get-config`, `save-config`, and `sync-time`

### Live verification

Verify against the current device:

1. read device info
2. run helper preflight from staged runtime
3. read current config
4. save a known-safe config and verify readback
5. sync time
6. verify device sync worker still launches and imports

### Clean-profile verification

On a fresh Windows user profile or equivalent clean state:

1. remove `%APPDATA%/ccpro-desktop/runtime`
2. remove any current-user `zkemkeeper` COM registration
3. launch packaged app without elevation
4. open Admin device config
5. verify helper bootstraps per-user COM and reads the device successfully

## Risks And Mitigations

- **Per-user COM registration may differ between 32-bit and 64-bit registry views**
  - Write the required keys in the current-user classes store used by the 32-bit host path and verify with live preflight.

- **Temporary extraction payload may drift from the staged payload**
  - Stage from embedded files into a versioned AppData directory and hash-check on each launch.

- **Current machine may hide the problem because it already has WiseEye installed**
  - Add clean-profile verification as a release gate.

- **Future app versions may leave stale runtime folders**
  - Keep runtime versioned and only ever launch the current app version's staged artifacts.

## Out Of Scope

- Full removal of `zkemkeeper.dll`
- Multi-device inventory and routing
- Replacing the current Admin UI behavior or scope beyond what is needed for no-admin portability

## Success Criteria

The feature is complete when all of the following are true:

- a copied packaged app can start on a fresh Windows user session without elevation
- employee login and normal user flows work
- admin login and machine-config flows work
- `machine-config-helper.exe get-config` works from staged AppData runtime
- `device-sync-worker.exe` runs from staged AppData runtime
- no packaged feature depends on machine-global Python or machine-wide COM registration
