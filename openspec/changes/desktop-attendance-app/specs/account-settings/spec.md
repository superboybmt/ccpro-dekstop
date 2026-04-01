## ADDED Requirements

### Requirement: View profile information
The system SHALL display the employee's profile information from `WiseEye.dbo.UserInfo`: full name, employee code, department, hire date, and schedule.

#### Scenario: Display profile
- **WHEN** employee navigates to Settings screen
- **THEN** system displays their profile info read-only (sourced from WiseEye, not editable)

### Requirement: Change password
The system SHALL allow employees to change their password. The form SHALL require: current password, new password (min 6 chars), confirm new password.

#### Scenario: Successful password change
- **WHEN** employee enters correct current password and valid new password with matching confirmation
- **THEN** system updates the bcrypt hash in `CCPro_Desktop.app_users` and shows success message

#### Scenario: Wrong current password
- **WHEN** employee enters incorrect current password
- **THEN** system rejects with "Mật khẩu hiện tại không đúng"

#### Scenario: Password mismatch
- **WHEN** new password and confirmation do not match
- **THEN** system rejects with "Mật khẩu xác nhận không khớp"

### Requirement: App information display
The system SHALL display app version, build number, and connection status to SQL Server.

#### Scenario: View app info
- **WHEN** employee views Settings screen
- **THEN** system shows app version, SQL Server connection status (connected/disconnected), and last sync time

### Requirement: Logout
The system SHALL allow employees to log out, clearing the local session and returning to the login screen.

#### Scenario: Logout action
- **WHEN** employee clicks "Đăng xuất" button
- **THEN** system clears session token and navigates to login screen
