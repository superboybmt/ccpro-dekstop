## 1. Admin Data Model

- [x] 1.1 Add `dbo.app_admins` schema initialization and indexes in the app database
- [x] 1.2 Add `dbo.device_config_audit_logs` schema initialization and indexes in the app database
- [x] 1.3 Add app-level settings persistence for admin-configurable security policies
- [x] 1.4 Add a bootstrap path to create the first admin account with bcrypt-hashed password

## 2. Admin Auth and Session

- [x] 2.1 Implement admin repository and auth service for `app_admins`
- [x] 2.2 Refactor session types/store to support both employee and admin principals
- [x] 2.3 Add admin-only IPC guards and admin auth IPC handlers

## 3. Machine Configuration Service

- [x] 3.1 Add a standalone `machine-config-helper.exe` build target for machine configuration
- [x] 3.2 Move `StateMode` read/write and SSR schedule read/write behind the helper CLI JSON contract
- [x] 3.3 Update the main-process machine-config service to call the helper executable instead of `ps1`/`python`
- [x] 3.4 Add read/write service for remote-risk policy settings
- [x] 3.5 Add audit-log persistence for successful and failed machine-config save attempts
- [x] 3.6 Package `machine-config-helper.exe` as an app resource and resolve runtime paths from `process.resourcesPath`

## 4. Admin UI

- [x] 4.1 Add admin login route and page
- [x] 4.2 Add admin device-config route and page for mode + four-state schedule
- [x] 4.3 Add a separate security-policy section with remote-risk toggle in the admin device-config page
- [x] 4.4 Wire save/read actions from the renderer to the admin machine-config and settings IPC handlers
- [x] 4.5 Show verification result, failure details, and current device config in the UI

## 5. Verification

- [x] 5.1 Add tests for admin auth, session guard, and audit-log persistence
- [x] 5.2 Add tests for helper CLI contract and main-process machine-config read/write integration
- [x] 5.3 Verify end-to-end on the real `8000T` device: read config, save mode, save schedule, and confirm readback
- [ ] 5.4 Verify packaged app on a second Windows machine where PowerShell/Python scripts are not used directly by the app
