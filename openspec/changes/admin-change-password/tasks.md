## 1. App Data Model

- [x] 1.1 Extend `dbo.app_admins` with `must_change_password` and password-change metadata needed for admin credential lifecycle
- [x] 1.2 Add `dbo.admin_auth_audit_logs` schema initialization and indexes in the app database

## 2. Admin Auth Service

- [x] 2.1 Add repository/service support for admin self-change password with current-password verification
- [x] 2.2 Add repository/service support for admin-to-admin temporary password reset with forced password change
- [x] 2.3 Add a dedicated maintenance recovery operation for emergency local password reset when no admin session is available

## 3. Admin Session And IPC

- [x] 3.1 Extend admin session/API contract with `mustChangePassword`
- [x] 3.2 Add admin-only IPC handlers for self-change password and admin password reset
- [x] 3.3 Enforce force-change behavior so an admin with temporary password cannot use other admin actions before updating the password

## 4. Admin UI

- [x] 4.1 Add `Admin > Tài khoản > Đổi mật khẩu` flow for authenticated admins
- [x] 4.2 Add force-change screen/redirect for admins logging in with temporary password
- [x] 4.3 If admin-management UI is in scope, add reset-password action for admin accounts; otherwise document the phase-1 maintenance path clearly for operators

## 5. Verification

- [x] 5.1 Add tests for admin auth service: current password mismatch, successful self-change, temporary reset, and forced-change enforcement
- [x] 5.2 Add IPC/session tests covering admin actions blocked while `mustChangePassword = true`
- [ ] 5.3 Verify manually: self-change password, reset by another admin, and single-admin emergency recovery path
