# Update Integrity Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two-phase update integrity verification so the app can validate signed manifest metadata first, then verify the downloaded installer checksum before opening it.

**Architecture:** Keep the existing `UpdateService` as the single boundary for manifest parsing and renderer notifications. Introduce a small integrity policy/config layer, a focused verifier utility for canonical manifest signing and SHA-256 hashing, and a dedicated download flow in main process so the renderer never trusts raw update URLs directly. Roll out in a compatibility-safe transition mode first, then enforce only when metadata is present or policy requires it.

**Tech Stack:** Electron, TypeScript, Node crypto/fs/https APIs, Vitest, preload IPC bridge, React

---

## File Map

- Modify: `src/shared/api.ts`
  Purpose: Extend update contracts with integrity metadata and download state payloads.
- Create: `src/main/services/update-integrity.ts`
  Purpose: Canonicalize manifest payloads, verify signatures, validate SHA-256 strings, hash downloaded files.
- Modify: `src/main/config/app-config.ts`
  Purpose: Load update integrity policy and optional public key path/env overrides.
- Modify: `src/main/services/update-service.ts`
  Purpose: Verify manifest metadata, expose integrity status, and download+verify update files before opening.
- Modify: `src/main/ipc/register-handlers.ts`
  Purpose: Add IPC handler for verified update download and stop renderer from opening raw download URLs directly.
- Modify: `src/preload/index.ts`
  Purpose: Expose the new verified update IPC method to renderer.
- Modify: `src/renderer/src/components/UpdateNotifier.tsx`
  Purpose: Use the verified download flow and show lightweight progress/error state.
- Modify: `src/main/services/__tests__/update-service.test.ts`
  Purpose: Cover transition policy, signature verification, checksum verification, and verified download flow.
- Modify: `src/main/ipc/__tests__/register-handlers.test.ts`
  Purpose: Cover the new verified update download IPC handler.
- Modify: `src/renderer/src/components/__tests__/update-notifier.test.tsx`
  Purpose: Cover the new renderer behavior while preserving current UX.
- Modify: `version.json`
  Purpose: Add example integrity metadata for local/dev verification.
- Create: `docs/reports/update-integrity-rollout.md`
  Purpose: Document manifest schema, rollout steps, and operational requirements for release publishing.

## Chunk 1: Phase 1 Manifest Integrity Verification

### Task 1: Add update integrity contract types

**Files:**
- Modify: `src/shared/api.ts`

- [ ] **Step 1: Write the failing type-aware tests**

Update the existing update-service and renderer tests to reference the new manifest shape:
- `integrity.checksumSha256`
- `integrity.signature`
- `integrity.signedFieldsVersion`
- `integrity.status`

Expected breakage: Type errors or failing assertions because the contract does not exist yet.

- [ ] **Step 2: Run the focused tests to capture the red state**

Run: `npx vitest run src/main/services/__tests__/update-service.test.ts src/renderer/src/components/__tests__/update-notifier.test.tsx`
Expected: FAIL with missing properties or outdated expectations.

- [ ] **Step 3: Add the minimal shared types**

Extend `UpdateInfo` with:
- `integrity?: UpdateIntegrityInfo`

Add focused types:
- `UpdateIntegrityState = 'legacy' | 'verified' | 'failed'`
- `UpdateIntegrityInfo`
- `UpdateDownloadState`

Keep fields optional where needed for transition compatibility.

- [ ] **Step 4: Re-run the focused tests**

Run: `npx vitest run src/main/services/__tests__/update-service.test.ts src/renderer/src/components/__tests__/update-notifier.test.tsx`
Expected: FAIL, but now due to missing implementation rather than missing types.

### Task 2: Add a focused integrity verifier utility

**Files:**
- Create: `src/main/services/update-integrity.ts`
- Modify: `src/main/services/__tests__/update-service.test.ts`

- [ ] **Step 1: Write failing unit coverage through update-service tests**

Add tests that require:
- invalid SHA-256 strings are rejected
- manifests without integrity metadata stay usable in legacy mode
- manifests with bad signatures are rejected in enforce mode
- manifests with valid signatures are accepted

- [ ] **Step 2: Run the targeted tests**

Run: `npx vitest run src/main/services/__tests__/update-service.test.ts`
Expected: FAIL because no verifier exists.

- [ ] **Step 3: Implement the smallest verifier utility**

In `src/main/services/update-integrity.ts`, add:
- `isValidSha256(value: string): boolean`
- `buildSignedManifestPayload(info: Pick<UpdateInfo, ...>): string`
- `verifyManifestSignature(payload: string, signature: string, publicKey: string): boolean`
- `hashFileSha256(filePath: string): Promise<string>`

Rules:
- canonical payload must use a fixed field order
- use base64 signature input
- use Node `crypto.createVerify('RSA-SHA256')`
- no third-party dependency

- [ ] **Step 4: Re-run the targeted tests**

Run: `npx vitest run src/main/services/__tests__/update-service.test.ts`
Expected: still FAIL only where update-service has not wired the verifier in yet.

### Task 3: Wire phase 1 manifest verification into UpdateService

**Files:**
- Modify: `src/main/config/app-config.ts`
- Modify: `src/main/services/update-service.ts`
- Modify: `src/main/services/__tests__/update-service.test.ts`
- Modify: `version.json`

- [ ] **Step 1: Add focused red tests for transition behavior**

Cover these cases:
- legacy manifest without integrity metadata returns update info with `integrity.status = 'legacy'`
- signed manifest with valid signature returns `integrity.status = 'verified'`
- signed manifest with invalid signature returns `null` in enforce mode
- signed manifest with invalid signature returns `null` in audit mode too, because metadata exists but is bad
- malformed integrity metadata is rejected

- [ ] **Step 2: Run the targeted tests**

Run: `npx vitest run src/main/services/__tests__/update-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add integrity policy config**

In `app-config.ts`, add a small config section:
- `updateIntegrity.mode`: `'audit' | 'enforce'`
- `updateIntegrity.publicKey`: string | null

Policy:
- default to `audit`
- in `audit`, unsigned legacy manifests are allowed
- in both `audit` and `enforce`, any manifest that claims integrity metadata but fails verification is rejected
- in `enforce`, unsigned manifests are rejected too

- [ ] **Step 4: Implement manifest verification in UpdateService**

Update manifest sanitization so it:
- validates HTTPS download URL
- validates integrity metadata shape if present
- verifies signature when metadata + public key are present
- returns `integrity.status`
- rejects unsigned manifests only in enforce mode

Do not change renderer logic yet.

- [ ] **Step 5: Update local `version.json` example**

Add sample integrity metadata that is valid for the dev/local flow used by tests and docs.

- [ ] **Step 6: Re-run the targeted tests**

Run: `npx vitest run src/main/services/__tests__/update-service.test.ts`
Expected: PASS.

## Chunk 2: Phase 2 Verified Download Flow

### Task 4: Add a verified update download API

**Files:**
- Modify: `src/shared/api.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc/register-handlers.ts`
- Modify: `src/main/ipc/__tests__/register-handlers.test.ts`

- [ ] **Step 1: Write the failing IPC coverage**

Add tests that require:
- renderer can call `app:download-verified-update`
- handler returns a structured result
- handler does not fall back to raw `shell.openExternal(downloadUrl)`

- [ ] **Step 2: Run the focused IPC test**

Run: `npx vitest run src/main/ipc/__tests__/register-handlers.test.ts`
Expected: FAIL because IPC channel does not exist.

- [ ] **Step 3: Add the minimal shared/preload contract**

In shared API add:
- `downloadVerifiedUpdate(info: UpdateInfo): Promise<UpdateDownloadState>`

Expose it from preload and implement a main IPC handler that delegates to `UpdateService`.

- [ ] **Step 4: Re-run the focused IPC test**

Run: `npx vitest run src/main/ipc/__tests__/register-handlers.test.ts`
Expected: FAIL only because UpdateService download logic is still missing.

### Task 5: Implement download + checksum verification in UpdateService

**Files:**
- Modify: `src/main/services/update-service.ts`
- Modify: `src/main/services/__tests__/update-service.test.ts`

- [ ] **Step 1: Write the failing download verification tests**

Cover these cases:
- verified manifest with matching checksum downloads to temp and opens local file
- checksum mismatch returns `{ ok: false, message: ... }` and does not open file
- legacy manifest without checksum refuses verified download with a clear message
- non-HTTPS download URL is still blocked

- [ ] **Step 2: Run the focused tests**

Run: `npx vitest run src/main/services/__tests__/update-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the smallest production flow**

Add to `UpdateService`:
- temp download directory creation under `app.getPath('temp')`
- safe filename derivation from URL/version
- `downloadVerifiedUpdate(info)` that:
  - requires `integrity.checksumSha256`
  - downloads file using Node HTTPS/fetch stream
  - hashes the downloaded file
  - compares hash with manifest checksum
  - opens the verified local file with `shell.openPath`
  - returns structured success/failure info

Keep cleanup simple:
- remove temp file on checksum mismatch
- keep verified installer file for user convenience

- [ ] **Step 4: Re-run the focused tests**

Run: `npx vitest run src/main/services/__tests__/update-service.test.ts`
Expected: PASS.

### Task 6: Switch renderer notifier to verified download

**Files:**
- Modify: `src/renderer/src/components/UpdateNotifier.tsx`
- Modify: `src/renderer/src/components/__tests__/update-notifier.test.tsx`

- [ ] **Step 1: Write the failing renderer tests**

Add coverage for:
- clicking update button calls `downloadVerifiedUpdate`, not `openExternal(downloadUrl)`
- button shows pending state during download
- integrity/download failures surface a readable message and keep the card visible

- [ ] **Step 2: Run the focused renderer tests**

Run: `npx vitest run src/renderer/src/components/__tests__/update-notifier.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the smallest UI change**

Update the notifier so it:
- uses `downloadVerifiedUpdate(updateInfo)`
- disables button while pending
- shows a compact status/error line
- dismisses only on success or explicit close

Do not redesign the component beyond what the new flow requires.

- [ ] **Step 4: Re-run the focused renderer tests**

Run: `npx vitest run src/renderer/src/components/__tests__/update-notifier.test.tsx`
Expected: PASS.

## Chunk 3: Verification, Rollout, And Review

### Task 7: Write rollout documentation

**Files:**
- Create: `docs/reports/update-integrity-rollout.md`

- [ ] **Step 1: Document manifest schema**

Describe:
- required fields
- integrity payload fields
- canonical signed payload
- audit vs enforce policy

- [ ] **Step 2: Document release publishing steps**

Describe:
- how to generate SHA-256
- how to sign manifest payload
- where to place public key for the app
- how to switch from audit to enforce safely

### Task 8: Run the full verification set

**Files:**
- No new production files expected

- [ ] **Step 1: Run update-focused suites**

Run: `npx vitest run src/main/services/__tests__/update-service.test.ts src/main/ipc/__tests__/register-handlers.test.ts src/renderer/src/components/__tests__/update-notifier.test.tsx`
Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 3: Run build verification**

Run: `npx electron-vite build`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

Run the app and verify:
- update check still shows the banner for legacy or verified manifests
- verified update button handles checksum failure gracefully
- verified installer opens locally on success

### Task 9: Final review checklist

**Files:**
- Review only

- [ ] **Step 1: Confirm no raw renderer trust of update download URL remains**
- [ ] **Step 2: Confirm legacy manifests remain usable in audit mode**
- [ ] **Step 3: Confirm invalid signed manifests are rejected in all modes**
- [ ] **Step 4: Confirm enforce mode blocks unsigned manifests**
- [ ] **Step 5: Confirm docs explain the release-side operational changes clearly**

