## 1. Environment & Secrets Hardening

- [x] 1.1 Remove hardcoded SQL password fallback from `app-config.ts` (keep empty string for `password`, keep defaults for `server`/`port`)
- [x] 1.2 Remove hardcoded ZKTeco device password fallback from `app-config.ts`
- [x] 1.3 Implement per-machine session key auto-generation using `crypto.randomBytes(32)` with `electron-store` persistence
- [x] 1.4 Update `SessionStore` to use the auto-generated key instead of static fallback
- [x] 1.5 Add `.env` and `.env.*` patterns to `.gitignore`
- [x] 1.6 Create `.env.example` documenting all environment variables

## 2. SQL Injection & Init Hardening

- [x] 2.1 Add regex validation (`/^[a-zA-Z0-9_]+$/`) for database name in `db/init.ts` before SQL interpolation
- [x] 2.2 Remove passwords from `console.log` messages in `seedDefaultAdmin` and `seedDefaultEmployee`

## 3. IPC Security

- [x] 3.1 Add `https://` URL scheme whitelist to `app:open-external` IPC handler in `register-handlers.ts`
- [x] 3.2 Move `dangerouslySetInnerHTML` CSS from `admin-users-page.tsx` to `styles.css`

## 4. Login Rate Limiting

- [x] 4.1 Create `src/main/services/rate-limiter.ts` with in-memory sliding window counter
- [x] 4.2 Integrate rate limiter into `AuthService.login()` (5 failures -> 5 min lock, 10 -> 30 min)
- [x] 4.3 Integrate rate limiter into `AdminAuthService.login()` with same thresholds
- [x] 4.4 Add rate limiter unit tests

## 5. Dependency Cleanup

- [x] 5.1 Run `npm audit fix` to resolve lodash vulnerability

## 6. Verification

- [x] 6.1 Run existing test suite (`vitest run`) — ensure no regressions
- [ ] 6.2 Manual test: app starts without `.env` -> fails gracefully with clear error for missing SQL password
- [ ] 6.3 Manual test: login lockout triggers after 5 rapid failures
- [ ] 6.4 Manual test: `openExternal` blocks non-HTTPS URLs
