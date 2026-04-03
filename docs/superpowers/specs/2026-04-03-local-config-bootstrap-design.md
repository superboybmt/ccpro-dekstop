# Local Config Bootstrap Design

**Date:** 2026-04-03

**Status:** Approved in conversation, pending written-spec review

## Goal

Make the portable desktop app run on a copied machine without requiring a sibling `.env` file, while avoiding hardcoded secrets in `app-config.ts`.

## Context

- `1.0.0` was easy to copy because the app still relied on hardcoded or implicit fallback config.
- The hardened builds now fail fast when `WISEEYE_SQL_PASSWORD` is missing.
- On non-dev machines, this currently looks like:
  - employee login cannot proceed
  - admin login shows a generic connection error
- The desired UX is still "copy app and open it", with no manual `.env` copy step for normal users.

## Constraints

- Do not put SQL secrets back into TypeScript source code or the bundled JS config module.
- Keep the runtime config source simple and maintainable.
- Preserve the current `.env` fallback for development and transitional deployments.
- Reuse the packaged `machine-config-helper.exe` instead of introducing another bootstrap binary.

## Recommended Approach

Use a first-run local config bootstrap flow:

1. The app stores machine-local runtime config at `%APPDATA%/ccpro-desktop/config.json`.
2. On startup, config resolution prefers:
   - local `config.json`
   - `.env` import path
   - built-in defaults for non-secret values only
3. If local config does not exist, the app invokes `machine-config-helper.exe` once to bootstrap it from a packaged seed resource.
4. If `.env` exists, the app imports it into `config.json` once and continues using the local file afterward.
5. If bootstrap or DB readiness fails, the login surfaces show the real startup reason instead of a generic connection message.

## Why This Approach

- Matches the requested zero-setup UX for copied portable builds.
- Keeps the runtime contract stable across dev and packaged environments.
- Avoids putting secrets back into `src/main/config/app-config.ts`.
- Gives us a single local config location that is easy to inspect, migrate, and support.

## Tradeoff

This is convenience-first, not strong secret protection.

- The bootstrap seed still ships with the release artifact in some form.
- That is weaker than a true machine-managed secret store.
- It is still better than hardcoding the secret in source code because:
  - the source and compiled config module stay clean
  - rotation can happen through build-time seed generation and local config refresh
  - runtime can migrate away from the seed later without rewriting app config logic

## Proposed Runtime Model

### Config file

Store app runtime config in:

```text
%APPDATA%/ccpro-desktop/config.json
```

Initial shape:

```json
{
  "sql": {
    "user": "sa",
    "password": "...",
    "server": "10.60.1.4",
    "port": 1433,
    "wiseEyeDatabase": "WiseEye",
    "appDatabase": "CCPro",
    "machineNo": 1
  },
  "deviceSync": {
    "ip": "10.60.1.5",
    "port": 4370,
    "password": 0,
    "bootstrapDays": 7,
    "pollIntervalMs": 60000,
    "runTimeoutMs": 180000
  },
  "updateIntegrity": {
    "mode": "audit",
    "publicKey": null
  }
}
```

Only the fields the app already uses should be stored. Do not invent a broader config system.

### Resolution order

At startup:

1. Read `%APPDATA%/ccpro-desktop/config.json` if present.
2. Otherwise try importing from `.env` if present.
3. Otherwise try helper bootstrap from packaged seed.
4. Apply built-in defaults only to non-secret values.
5. Fail clearly if required secrets are still missing.

## Helper Responsibilities

Extend `machine-config-helper.exe` with a focused bootstrap command, for example:

```text
machine-config-helper.exe bootstrap-app-config --output <path> --seed <path>
```

The helper should:

- create parent directories if needed
- write the local config file atomically
- avoid overwriting an existing config unless explicitly forced
- return structured JSON on stdout

Expected success shape:

```json
{
  "ok": true,
  "message": "Bootstrapped local app config",
  "outputPath": "C:\\Users\\...\\AppData\\Roaming\\ccpro-desktop\\config.json"
}
```

## Seed Source

Use a packaged seed resource generated during build, for example:

```text
resources/bootstrap/app-config.seed.json
```

Build-time generation should read the release `.env` or equivalent internal config input and emit the seed JSON into `build/bootstrap/`.

This keeps the release pipeline explicit:

- dev can still use `.env`
- production-like builds can embed a seed for zero-setup bootstrap

## Migration Rules

### If local config already exists

- Use it as the source of truth.
- Do not overwrite it automatically.

### If local config does not exist but `.env` exists

- Import `.env` values into local `config.json`.
- Continue startup using the new local file.
- Do not require the `.env` file afterward.

### If neither local config nor `.env` exists

- Attempt helper bootstrap from the packaged seed.
- If that succeeds, continue startup.
- If it fails, surface the exact startup error in the login flows.

## Error Handling

Add a small startup diagnostics model in main process so renderer can distinguish:

- missing required config
- SQL connectivity failure
- generic startup failure

Minimum goal:

- employee login should show the real startup message when readiness fails
- admin login should stop collapsing all startup errors into "Loi ket noi, vui long thu lai"

## Files Expected To Change

- `src/main/config/app-config.ts`
- `src/main/config/__tests__/app-config.test.ts`
- `src/main/startup.ts`
- `src/main/ipc/register-handlers.ts`
- `src/shared/api.ts`
- `src/preload/index.ts`
- `src/renderer/src/pages/login-page.tsx`
- `src/renderer/src/pages/admin-login-page.tsx`
- `src/main/services/machine-config-service.ts`
- `src/main/services/__tests__/machine-config-service.test.ts`
- `scripts/machine-config-helper.py`
- `scripts/build-machine-config-helper.ps1`
- `package.json`

## Test Strategy

Automation should cover:

- local config preferred over `.env`
- `.env` import path works when local config is missing
- packaged bootstrap path works when both local config and `.env` are missing
- helper bootstrap does not overwrite an existing local config
- employee login gets a clear startup error on readiness failure
- admin login gets the same clear startup error instead of a generic fallback

Manual verification should cover:

1. Fresh machine with no `%APPDATA%/ccpro-desktop/config.json` and no `.env`
2. First launch creates local config and allows login
3. Second launch uses local config directly
4. SQL/LAN disconnected machine shows a clear connection error
5. Deleting local config retriggers bootstrap correctly
