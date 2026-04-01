## 1. App Data Model

- [x] 1.1 Extend `dbo.app_users` with app-level activation metadata for employee accounts
- [x] 1.2 Add `dbo.admin_user_audit_logs` schema initialization and indexes in the app database
- [x] 1.3 Add repository queries that join `WiseEye.UserInfo` with `dbo.app_users` for admin user listing and search

## 2. Employee Auth Enforcement

- [x] 2.1 Update employee auth repository/service to read app-level active state from `dbo.app_users`
- [x] 2.2 Block employee login when the app-level account is inactive while keeping the existing WiseEye enabled check
- [x] 2.3 Preserve the existing `is_first_login` flow after admin-initiated password reset

## 3. Admin User Management Service

- [x] 3.1 Implement admin user management repository/service for list, activate/deactivate, and reset password actions
- [x] 3.2 Add audit-log persistence for activate, deactivate, and reset password operations
- [x] 3.3 Add admin-only IPC handlers for user listing, app-status updates, and password reset

## 4. Admin UI

- [x] 4.1 Add a dedicated admin user management route/page in the admin area
- [x] 4.2 Build the user table with search, WiseEye status, app status, and force-password-change indicators
- [x] 4.3 Add activate/deactivate actions with confirmation UX
- [x] 4.4 Add reset-password action that captures a temporary password and explains that the user must change it on next login

## 5. Verification

- [x] 5.1 Add tests for schema/repository behavior and auth enforcement for inactive app accounts
- [x] 5.2 Add tests for admin user management service actions and audit logging
- [x] 5.3 Add renderer tests for the admin user management page flows
- [ ] 5.4 Verify end-to-end manually: deactivate user, confirm login is blocked, reset password, and confirm forced password change on next login
