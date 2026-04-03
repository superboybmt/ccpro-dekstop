## Why

CCPro Desktop has **4 critical security vulnerabilities** and **5 warnings** discovered during a full code audit on 02/04/2026. Hardcoded database credentials (SQL Server `sa` account), a static session encryption key, a SQL injection vector in init, and an unrestricted `shell.openExternal()` expose the app to credential theft, session hijacking, arbitrary database manipulation, and local file access attacks. These must be fixed before any production rollout.

## What Changes

- **Remove all hardcoded credentials** from `app-config.ts` (SQL password, session key, device password) and load from `.env` or auto-generated secure storage
- **Auto-generate unique session encryption key** per machine on first launch
- **Fix SQL injection** in `db/init.ts` by validating database name before interpolation
- **Whitelist `shell.openExternal()`** to only allow `https://` URLs
- **Add login rate limiting** to both user and admin auth services (lockout after repeated failures)
- **Remove password from console.log** in default seed functions
- **Add `.env` to `.gitignore`** before any `.env` file is introduced
- **Move inline `dangerouslySetInnerHTML` CSS** to `styles.css`
- **Fix lodash** vulnerability via `npm audit fix`

## Capabilities

### New Capabilities
- `env-config`: Externalize all secrets to `.env` with validation and auto-generation of per-machine session keys
- `login-rate-limiting`: Brute-force protection with configurable lockout thresholds for both user and admin login
- `url-whitelist`: Restrict `shell.openExternal` to safe URL schemes only

### Modified Capabilities
_(No existing specs to modify)_

## Impact

- **Files modified:** `app-config.ts`, `db/init.ts`, `auth-service.ts`, `admin-auth-service.ts`, `register-handlers.ts`, `index.ts`, `admin-users-page.tsx`, `.gitignore`
- **New files:** `.env.example`, potentially a `generate-session-key.ts` utility
- **Dependencies:** lodash transitive dependency updated
- **Breaking changes:** None — all changes are backward compatible. Existing installations without `.env` will still work via auto-generated fallbacks.
