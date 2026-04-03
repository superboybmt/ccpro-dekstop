## Context

CCPro Desktop is an Electron app (React + Vite + TypeScript) for PNJ employee attendance. It connects to a SQL Server (`mssql` package) with two databases: WiseEye (read-only attendance device data) and CCPro (app-specific data). The app runs on corporate Windows machines inside the LAN.

Current state: All credentials are hardcoded as fallback defaults in `app-config.ts`. Session encryption uses a static key shared across all installations. The `db/init.ts` file interpolates a database name directly into SQL. There is no brute-force protection on either login flow.

## Goals / Non-Goals

**Goals:**
- Eliminate all hardcoded secrets from source code
- Generate unique per-machine session encryption keys
- Protect against SQL injection in database initialization
- Restrict IPC `openExternal` to safe URL schemes
- Add brute-force protection to both user and admin login
- Clean up minor security hygiene issues (log leakage, .gitignore, inline CSS, lodash)

**Non-Goals:**
- Full sandbox enablement (requires deeper preload/IPC refactor — tracked separately)
- Migrating away from `sa` SQL user to least-privilege accounts (infrastructure change)
- Adding network-level encryption (TLS) to SQL connections (requires cert infrastructure)

## Decisions

### 1. Environment variable loading strategy
**Decision:** Use `process.env` with empty-string fallbacks (crash-fast if missing) instead of a `.env` file loader like `dotenv`.

**Rationale:** Electron main process has native access to env vars. For desktop deployment, environment variables are set via the installer/startup script or machine config. Adding `dotenv` is unnecessary overhead for a packaged Electron app. Instead, we'll ship a `.env.example` documenting all required vars, and the `machine-config-helper.exe` can set them.

### 2. Per-machine session key generation
**Decision:** On first launch, generate a random 32-byte hex key using `crypto.randomBytes(32).toString('hex')` and persist it via `electron-store` in a separate settings store (not the session store itself).

**Rationale:** This ensures each machine has a unique key without requiring manual configuration. The key survives app updates (stored in `userData`). Using `electron-store` is consistent with the existing session storage pattern.

### 3. Rate limiting implementation
**Decision:** In-memory sliding window counter per IP/username, with configurable thresholds: 5 failures → 5 min lockout, 10 failures → 30 min lockout.

**Rationale:** No external dependency (no Redis needed). For a desktop app with single-user access, in-memory is sufficient. The counter resets on app restart, which is acceptable since an attacker would need physical access.

### 4. Database name validation
**Decision:** Validate with regex `/^[a-zA-Z0-9_]+$/` before interpolation, throw on failure.

**Rationale:** SQL Server database names in brackets `[name]` are safe for alphanumeric+underscore. This is the simplest fix without a major refactor of the init flow.

### 5. URL whitelist for openExternal
**Decision:** Only allow `https://` protocol. Block all other schemes (`file://`, `smb://`, `http://`).

**Rationale:** The app only needs to open GitHub release pages for updates. No legitimate use case for non-HTTPS URLs.

## Risks / Trade-offs

- **[Risk]** Existing installations without env vars will fail to connect after removing hardcoded defaults → **Mitigation:** Keep defaults only for `server` and `port` (non-secret topology), require env vars only for passwords. On first run, the machine-config-helper sets them.
- **[Risk]** In-memory rate limiting resets on app restart → **Mitigation:** Acceptable for desktop context; attacker needs physical access to restart.
- **[Risk]** Auto-generated session key is lost if `userData` is wiped → **Mitigation:** Session invalidation is acceptable; users simply re-login.
