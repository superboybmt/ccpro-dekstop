# Local Config Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let copied portable builds bootstrap machine-local runtime config on first launch, then run from `%APPDATA%/ccpro-desktop/config.json` without needing a sibling `.env` file.

**Architecture:** Keep config resolution simple: prefer local `config.json`, import `.env` once when present, otherwise invoke the packaged `machine-config-helper.exe` to write the local file from a packaged seed. Add a small startup diagnostics path so login screens show the actual readiness failure instead of generic connection text.

**Tech Stack:** Electron main process, TypeScript, existing Python-based `machine-config-helper`, Electron Builder extra resources, Vitest

---

## Chunk 1: Local Config Model And Resolution Order

### Task 1: Introduce a focused app runtime config loader

**Files:**
- Create: `src/main/config/app-runtime-config.ts`
- Modify: `src/main/config/app-config.ts`
- Modify: `src/main/config/__tests__/app-config.test.ts`

- [ ] **Step 1: Write the failing tests for resolution order**

Add tests that expect:
- local `%APPDATA%` config wins over `.env`
- `.env` still works when local config is absent
- non-secret defaults still apply when omitted from local config
- missing SQL password still throws a clear error when no source provides it

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/config/__tests__/app-config.test.ts`
Expected: FAIL because config still only reads `.env`/process env in the current module path.

- [ ] **Step 3: Implement the minimal runtime config loader**

Add a small loader module that:
- resolves `%APPDATA%/ccpro-desktop/config.json`
- reads and parses local config when present
- falls back to `.env` import only when local config is absent
- merges in defaults only for non-secret fields

Keep the exported `appConfig` shape stable so the rest of main process does not need a broad refactor.

- [ ] **Step 4: Wire `app-config.ts` through the loader**

Refactor `app-config.ts` so it:
- uses the new loader result
- still enforces `WISEEYE_SQL_PASSWORD` via a clear runtime error
- no longer owns path-search logic inline

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/main/config/__tests__/app-config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/config/app-runtime-config.ts src/main/config/app-config.ts src/main/config/__tests__/app-config.test.ts
git commit -m "feat: add local runtime config loader"
```

## Chunk 2: Helper Bootstrap And Seed Packaging

### Task 2: Add first-run bootstrap from the packaged helper

**Files:**
- Modify: `scripts/machine-config-helper.py`
- Modify: `src/main/services/machine-config-service.ts`
- Modify: `src/main/services/__tests__/machine-config-service.test.ts`
- Create: `scripts/build-app-config-seed.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test for helper bootstrap**

Expand `src/main/services/__tests__/machine-config-service.test.ts` or add a dedicated test file to expect:
- helper supports a focused `bootstrap-app-config` command
- the service invokes the helper with output and seed paths
- helper bootstrap does not overwrite an existing local config by default

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/services/__tests__/machine-config-service.test.ts`
Expected: FAIL because no bootstrap command exists yet.

- [ ] **Step 3: Extend the helper with bootstrap support**

Add a helper command such as:

```text
machine-config-helper.exe bootstrap-app-config --output <path> --seed <path>
```

Implementation rules:
- create parent directories
- write JSON atomically
- emit structured JSON
- return a clear non-zero failure if the seed is missing or invalid

- [ ] **Step 4: Generate the packaged seed at build time**

Create a small build script that:
- reads the release `.env` or other internal build input
- writes `build/bootstrap/app-config.seed.json`
- includes only the runtime fields the app already needs

- [ ] **Step 5: Package the seed with the app**

Update `package.json` build scripts and `extraResources` so packaged builds include:
- `machine-config-helper.exe`
- `bootstrap/app-config.seed.json`

- [ ] **Step 6: Run tests to verify they pass**

Run:
- `npx vitest run src/main/services/__tests__/machine-config-service.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/machine-config-helper.py src/main/services/machine-config-service.ts src/main/services/__tests__/machine-config-service.test.ts scripts/build-app-config-seed.mjs package.json
git commit -m "feat: bootstrap app config from packaged helper"
```

## Chunk 3: First-Run Bootstrap And Env Migration In Startup

### Task 3: Bootstrap `%APPDATA%` config before DB initialization

**Files:**
- Modify: `src/main/startup.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/config/app-runtime-config.ts`
- Create: `src/main/__tests__/startup-config-bootstrap.test.ts`

- [ ] **Step 1: Write the failing startup test**

Add a startup-focused test that expects:
- if local config is missing, startup tries `.env` import first
- if `.env` is absent, startup runs helper bootstrap before DB init
- if bootstrap succeeds, DB init can proceed
- if bootstrap fails, readiness stores the startup error for later UI surfacing

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/startup-config-bootstrap.test.ts`
Expected: FAIL because startup does not bootstrap config yet.

- [ ] **Step 3: Implement bootstrap-before-db behavior**

Keep the startup sequence small:
- resolve config state
- bootstrap or import only when needed
- then call `initializeAppDatabase()`

Do not mix broad device config logic into app startup.

- [ ] **Step 4: Add one-time `.env` import migration**

When local config is missing but `.env` exists:
- convert `.env` values into local `config.json`
- continue startup from the local file
- leave `.env` support intact for development

- [ ] **Step 5: Run tests to verify they pass**

Run:
- `npx vitest run src/main/__tests__/startup-config-bootstrap.test.ts src/main/__tests__/startup.test.ts src/main/config/__tests__/app-config.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/startup.ts src/main/index.ts src/main/config/app-runtime-config.ts src/main/__tests__/startup-config-bootstrap.test.ts
git commit -m "feat: bootstrap local app config before db init"
```

## Chunk 4: Startup Diagnostics To Login Screens

### Task 4: Surface actual readiness errors in employee and admin login

**Files:**
- Modify: `src/shared/api.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/renderer/src/providers/auth-provider.tsx`
- Modify: `src/renderer/src/pages/login-page.tsx`
- Modify: `src/renderer/src/pages/admin-login-page.tsx`
- Modify: `src/renderer/src/lib/errors.ts`
- Create or modify: `src/main/ipc/__tests__/register-handlers.test.ts`
- Create or modify: `src/renderer/src/pages/__tests__/dashboard-error-state.test.tsx`

- [ ] **Step 1: Write the failing tests for startup diagnostics**

Add coverage that expects:
- readiness failures return a stable startup diagnostic payload
- employee login shows the actual startup message
- admin login also shows the actual startup message instead of generic fallback text

- [ ] **Step 2: Run tests to verify they fail**

Run:
- `npx vitest run src/main/ipc/__tests__/register-handlers.test.ts src/renderer/src/pages/__tests__/dashboard-error-state.test.tsx`

Expected: FAIL because startup diagnostics are not exposed yet.

- [ ] **Step 3: Add a minimal diagnostics contract**

Expose only what the UI needs, for example:
- startup status: `ready` | `error`
- message
- category: `missing-config` | `sql-connectivity` | `unknown`

Do not build a full observability system here.

- [ ] **Step 4: Update login handling**

Make both login screens:
- display server-provided startup failures directly
- keep existing validation and normal auth messages unchanged

- [ ] **Step 5: Run tests to verify they pass**

Run:
- `npx vitest run src/main/ipc/__tests__/register-handlers.test.ts src/renderer/src/pages/__tests__/dashboard-error-state.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/api.ts src/preload/index.ts src/main/ipc/register-handlers.ts src/renderer/src/providers/auth-provider.tsx src/renderer/src/pages/login-page.tsx src/renderer/src/pages/admin-login-page.tsx src/renderer/src/lib/errors.ts src/main/ipc/__tests__/register-handlers.test.ts src/renderer/src/pages/__tests__/dashboard-error-state.test.tsx
git commit -m "feat: show startup diagnostics on login"
```

## Chunk 5: Packaging And Manual Verification

### Task 5: Verify the zero-setup portable flow

**Files:**
- Modify: `docs/reports/production-go-live-checklist.md`
- Optionally modify: `.env.example`

- [ ] **Step 1: Run focused automation**

Run:
- `npm run check:encoding -- docs/superpowers/specs/2026-04-03-local-config-bootstrap-design.md docs/superpowers/plans/2026-04-03-local-config-bootstrap.md`
- `npx vitest run`

Expected: PASS

- [ ] **Step 2: Build the packaged app**

Run:
- `npm run build:portable`

Expected:
- build succeeds
- output includes portable artifact
- output includes helper and bootstrap seed resources

- [ ] **Step 3: Verify first-run bootstrap manually**

On a fresh test machine or by clearing local config:
- remove `%APPDATA%/ccpro-desktop/config.json`
- ensure no sibling `.env`
- launch packaged app

Expected:
- local config is created automatically
- app reaches DB init
- login can proceed if LAN/SQL are available

- [ ] **Step 4: Verify migration from `.env`**

With no local config but with a valid `.env`:
- launch packaged app

Expected:
- app imports `.env` into `%APPDATA%/ccpro-desktop/config.json`
- subsequent launches work without `.env`

- [ ] **Step 5: Verify error messaging on failure**

Test two negative cases:
- missing seed / missing SQL password
- SQL server unreachable over LAN

Expected:
- employee login and admin login both show a clear startup reason

- [ ] **Step 6: Update go-live checklist**

Update `docs/reports/production-go-live-checklist.md` with the new evidence and current readiness status.

- [ ] **Step 7: Commit**

```bash
git add docs/reports/production-go-live-checklist.md .env.example package.json
git commit -m "docs: verify local config bootstrap rollout"
```
