## ADDED Requirements

### Requirement: Employee login with employee code
The system SHALL allow employees to authenticate using their PNJ employee code (`UserFullCode` from WiseEye `UserInfo` table) as username and a password.

#### Scenario: Successful login
- **WHEN** employee enters valid employee code and correct password
- **THEN** system authenticates the user and redirects to Dashboard

#### Scenario: Invalid credentials
- **WHEN** employee enters invalid employee code or wrong password
- **THEN** system displays error message "Sai mã nhân viên hoặc mật khẩu" and remains on login screen

#### Scenario: Disabled employee
- **WHEN** employee with `UserEnabled = false` in WiseEye attempts to login
- **THEN** system rejects login with message "Tài khoản đã bị vô hiệu hóa"

### Requirement: Default password equals employee code
The system SHALL accept the employee code as the default password for first-time login. When no record exists in `CCPro_Desktop.app_users` for the employee, the system SHALL verify the entered password matches the employee code.

#### Scenario: First-time login with default password
- **WHEN** employee logs in for the first time using employee code as password
- **THEN** system authenticates successfully and immediately requires password change

#### Scenario: First-time login with wrong password
- **WHEN** employee logs in for the first time but enters wrong password (not matching employee code)
- **THEN** system rejects login with generic error message

### Requirement: Mandatory password change on first login
The system SHALL force employees to change their password on first login. The system SHALL NOT allow access to any other screen until the password is changed.

#### Scenario: Password change prompt
- **WHEN** employee successfully authenticates with default password
- **THEN** system displays password change form requiring new password (minimum 6 characters) and confirmation

#### Scenario: Successful password change
- **WHEN** employee submits valid new password and confirmation match
- **THEN** system creates record in `CCPro_Desktop.app_users` with bcrypt-hashed password, sets `is_first_login = false`, and redirects to Dashboard

#### Scenario: Password too short
- **WHEN** employee submits password shorter than 6 characters
- **THEN** system displays validation error and does not save

### Requirement: Session persistence
The system SHALL maintain the authenticated session across app restarts using a local encrypted token. Session SHALL expire after 30 days of inactivity.

#### Scenario: App restart with valid session
- **WHEN** employee reopens the app within 30 days of last activity
- **THEN** system auto-authenticates and shows Dashboard without login

#### Scenario: Session expired
- **WHEN** employee reopens the app after 30 days of inactivity
- **THEN** system shows login screen
