# Electron Sandbox Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Electron renderer sandboxing without breaking preload, IPC, login, admin, update, or device-sync flows.

**Architecture:** Keep the existing preload-bridge architecture, prove current behavior with focused regression tests, then flip `BrowserWindow.webPreferences.sandbox` to `true` behind tests. If any preload or renderer assumptions break under sandbox, fix them at the boundary instead of adding new layers.

**Tech Stack:** Electron, electron-vite, Vitest, React, preload `contextBridge`, IPC handlers

---

## File Map

- Modify: `src/main/index.ts`
  Purpose: Enable `sandbox: true` and keep BrowserWindow setup minimal.
- Modify: `src/preload/index.ts`
  Purpose: Adjust preload bridge only if sandbox reveals an incompatible assumption.
- Modify: `src/main/ipc/register-handlers.ts`
  Purpose: Only if sandbox rollout exposes IPC serialization or handler contract issues.
- Create/Modify: `src/main/__tests__/window-security.test.ts`
  Purpose: Assert BrowserWindow security flags from main-process config.
- Modify: `src/main/__tests__/startup.test.ts`
  Purpose: Keep startup sequencing covered while hardening window config.
- Create/Modify: `src/renderer/src/app/__tests__/sandbox-smoke.test.tsx`
  Purpose: Smoke-test renderer flows that depend on the preload bridge.
- Verify only: existing tests in `src/main/ipc/__tests__/register-handlers.test.ts`, `src/renderer/src/app/__tests__/full-flow.test.tsx`, `src/renderer/src/components/__tests__/update-notifier.test.tsx`

## Chunk 1: Lock Down Current Behavior With Tests

### Task 1: Add a BrowserWindow security config test

**Files:**
- Create: `src/main/__tests__/window-security.test.ts`
- Reference: `src/main/index.ts`

- [ ] **Step 1: Write the failing test**

Create a focused test that extracts or exercises the BrowserWindow options and expects:
- `preload` is set
- `sandbox` is `true`
- `nodeIntegration` is absent or `false`

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/__tests__/window-security.test.ts`
Expected: FAIL because current config still uses `sandbox: false`.

- [ ] **Step 3: Add the smallest seam needed for testability**

If needed, extract BrowserWindow option construction into a tiny helper in `src/main/index.ts` or a nearby focused file. Do not refactor startup flow beyond that.

- [ ] **Step 4: Run test again**

Run: `npx vitest run src/main/__tests__/window-security.test.ts`
Expected: still FAIL, but now failure is specifically on `sandbox`.

- [ ] **Step 5: Commit**

```bash
git add src/main/__tests__/window-security.test.ts src/main/index.ts
git commit -m "test: cover browser window security settings"
```

### Task 2: Add a preload bridge smoke test

**Files:**
- Create: `src/renderer/src/app/__tests__/sandbox-smoke.test.tsx`
- Reference: `src/preload/index.ts`
- Reference: `src/shared/api.ts`

- [ ] **Step 1: Write the failing test**

Add a smoke test that stubs `window.ccpro` with the same shape exposed by preload and verifies a minimal flow can render and call:
- `auth.getSession()`
- `settings.getAppInfo()`
- `app.checkForUpdates()`

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/app/__tests__/sandbox-smoke.test.tsx`
Expected: FAIL until the test harness reflects the current preload contract clearly.

- [ ] **Step 3: Fix only the test harness**

Do not change production code yet. Make the test reflect the actual preload surface already exposed in `src/preload/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/app/__tests__/sandbox-smoke.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/app/__tests__/sandbox-smoke.test.tsx
git commit -m "test: add preload bridge smoke coverage"
```

## Chunk 2: Enable Sandbox With Minimal Production Changes

### Task 3: Flip the BrowserWindow sandbox flag

**Files:**
- Modify: `src/main/index.ts`
- Test: `src/main/__tests__/window-security.test.ts`

- [ ] **Step 1: Change the failing line only**

Set `webPreferences.sandbox` to `true` in `src/main/index.ts`. Do not bundle unrelated BrowserWindow changes in this step.

- [ ] **Step 2: Run targeted main-process tests**

Run: `npx vitest run src/main/__tests__/window-security.test.ts src/main/__tests__/startup.test.ts`
Expected: PASS.

- [ ] **Step 3: Run targeted IPC and renderer smoke tests**

Run: `npx vitest run src/main/ipc/__tests__/register-handlers.test.ts src/renderer/src/app/__tests__/sandbox-smoke.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/main/__tests__/window-security.test.ts src/main/__tests__/startup.test.ts src/renderer/src/app/__tests__/sandbox-smoke.test.tsx
git commit -m "feat: enable electron renderer sandbox"
```

### Task 4: Fix any sandbox incompatibility at the boundary

**Files:**
- Modify only as needed: `src/preload/index.ts`
- Modify only as needed: `src/main/ipc/register-handlers.ts`
- Modify tests touched by the breakage

- [ ] **Step 1: Reproduce the exact incompatibility**

If a test or dev run fails after enabling sandbox, capture the exact failing contract first:
- missing preload API
- bad serialization
- renderer assumption about globals

- [ ] **Step 2: Write or tighten a failing regression test**

Prefer adding coverage around the exact broken boundary rather than broad integration edits.

- [ ] **Step 3: Implement the smallest compatible fix**

Rules:
- keep API shape stable
- keep renderer calling code unchanged unless strictly necessary
- do not add new preload channels unless a real missing capability is proven

- [ ] **Step 4: Re-run the exact failing test first**

Use the narrowest command that reproduces the issue.

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/main/ipc/register-handlers.ts src/main/ipc/__tests__/register-handlers.test.ts src/renderer/src/app/__tests__/sandbox-smoke.test.tsx
git commit -m "fix: restore preload compatibility under sandbox"
```

## Chunk 3: Full Verification And Manual QA

### Task 5: Run the automated verification set

**Files:**
- No production changes

- [ ] **Step 1: Run main and renderer test suites**

Run: `npx vitest run`
Expected: PASS with no new failures.

- [ ] **Step 2: Run build verification**

Run: `npx electron-vite build`
Expected: PASS and regenerate `out/`.

- [ ] **Step 3: Commit if needed**

If verification required no additional edits, skip commit. If small fixes were needed, commit them separately with a focused message.

### Task 6: Manual runtime smoke test in dev

**Files:**
- No production changes unless a real bug is found

- [ ] **Step 1: Start the app**

Run: `npm run dev`
Expected: app launches without preload or renderer bootstrap errors.

- [ ] **Step 2: Verify employee flow**

Check:
- login screen renders
- employee login works
- dashboard loads
- history page loads

- [ ] **Step 3: Verify admin flow**

Check:
- admin login works
- admin device config screen loads
- machine config actions still reach IPC without serialization errors

- [ ] **Step 4: Verify non-auth app flows**

Check:
- update notifier can call `checkForUpdates`
- external HTTPS link still opens
- avatar upload/remove still works

- [ ] **Step 5: Capture any regression before changing more code**

If a bug appears, stop and create a narrowly scoped follow-up fix with test coverage. Do not continue stacking changes blindly.

## Rollback Strategy

- If sandbox breaks preload at startup, revert only the sandbox flag commit first.
- If sandbox works in tests but fails in manual dev runtime, keep the flag change isolated and debug from logs before editing other subsystems.
- Do not combine this work with unrelated Electron cleanup, UI changes, or IPC refactors.

## Verification Checklist

- [ ] `src/main/__tests__/window-security.test.ts` passes
- [ ] `src/main/__tests__/startup.test.ts` passes
- [ ] `src/main/ipc/__tests__/register-handlers.test.ts` passes
- [ ] `src/renderer/src/app/__tests__/sandbox-smoke.test.tsx` passes
- [ ] `npx vitest run` passes
- [ ] `npx electron-vite build` passes
- [ ] `npm run dev` manual smoke test passes for employee and admin flows

