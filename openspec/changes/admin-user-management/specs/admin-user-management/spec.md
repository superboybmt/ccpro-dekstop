## ADDED Requirements

### Requirement: Admin can browse managed employee accounts
The system SHALL provide an admin-only user management view that lists employee accounts by joining `WiseEye.UserInfo` with app account data from `dbo.app_users`.

#### Scenario: Admin opens the user management page
- **WHEN** an authenticated admin opens the user management page
- **THEN** the system shows a list of employees with employee code, full name, WiseEye status, app status, and whether the user must change password at next login

#### Scenario: Admin searches for a user
- **WHEN** an authenticated admin searches by employee code or employee name
- **THEN** the system filters the list to matching employee accounts without requiring a direct database query from the renderer

### Requirement: Admin can activate or deactivate app access
The system SHALL let an authenticated admin activate or deactivate app-level access for an employee account independently from `WiseEye.UserEnabled`.

#### Scenario: Admin deactivates a user
- **WHEN** an authenticated admin deactivates an employee account in admin user management
- **THEN** the system persists an app-level inactive state for that employee in `dbo.app_users`
- **AND** the system records an audit entry for the action

#### Scenario: Inactive app user attempts login
- **WHEN** an employee account is inactive at the app level and the user attempts to log in
- **THEN** the system rejects the login even if the WiseEye account is still enabled
- **AND** the system returns a message that the app account has been disabled

#### Scenario: Admin reactivates a user
- **WHEN** an authenticated admin reactivates an employee account
- **THEN** the system persists an app-level active state for that employee
- **AND** the system records an audit entry for the action

### Requirement: Admin can reset password and force password change
The system SHALL let an authenticated admin reset an employee app password to a temporary password and force the user to change it on the next successful login.

#### Scenario: Admin resets password
- **WHEN** an authenticated admin resets an employee password with a temporary password
- **THEN** the system updates the stored password hash for that employee
- **AND** the system sets the account to require password change at next login
- **AND** the system records an audit entry for the action

#### Scenario: User logs in after admin password reset
- **WHEN** an employee logs in successfully using the temporary password after an admin reset
- **THEN** the system authenticates the user
- **AND** the system marks the session as requiring password change before normal use continues

### Requirement: Admin user actions are auditable
The system SHALL persist an audit trail for app-level employee account management actions performed by admins.

#### Scenario: Admin action writes audit log
- **WHEN** an admin activates, deactivates, or resets the password of an employee account
- **THEN** the system stores the admin identifier, employee identifier, action name, and before/after state in the admin user audit log
