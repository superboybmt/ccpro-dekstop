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
- **WHEN** an admin activates, deactivates, resets the password, or unbinds the device of an employee account
- **THEN** the system stores the admin identifier, employee identifier, action name, and before/after state in the admin user audit log

### Requirement: Admin can select multiple users and perform bulk operations
The system SHALL let an authenticated admin select multiple employee accounts via checkboxes and perform batch activate/deactivate or batch unbind device operations.

#### Scenario: Admin selects multiple users via checkboxes
- **WHEN** an authenticated admin checks the checkbox next to one or more employee rows
- **THEN** the system tracks the selected user enroll numbers in UI state
- **AND** the system shows a floating action bar displaying the count of selected users and available bulk actions

#### Scenario: Admin uses "Select All" checkbox
- **WHEN** an authenticated admin checks the header "Select All" checkbox
- **THEN** the system selects all users on the current paginated page
- **AND** unchecking it deselects all users on the current page

#### Scenario: Admin bulk activates or deactivates selected users
- **WHEN** an authenticated admin clicks "Khóa tất cả" or "Mở tất cả" from the bulk action bar
- **THEN** the system shows a confirmation dialog with the count of affected users
- **AND** upon confirmation, the system sends the list of selected user enroll numbers to the batch set active state IPC
- **AND** the system persists the app-level active state for each user and records an audit entry per user
- **AND** the system clears the selection and reloads the user list after completion

#### Scenario: Admin bulk unbinds devices for selected users
- **WHEN** an authenticated admin clicks "Gỡ thiết bị" from the bulk action bar
- **THEN** the system shows a confirmation dialog with the count of affected users who have a bound device
- **AND** upon confirmation, the system sends the list of selected user enroll numbers to the batch unbind device IPC
- **AND** the system removes the device binding for each user and records an audit entry per user
- **AND** the system clears the selection and reloads the user list after completion

#### Scenario: Batch operation returns summary result
- **WHEN** a batch operation completes
- **THEN** the system returns a summary with success count, failure count, and a human-readable message
- **AND** the UI displays a toast reflecting the batch result
