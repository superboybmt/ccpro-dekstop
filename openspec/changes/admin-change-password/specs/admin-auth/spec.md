## MODIFIED Requirements

### Requirement: Admins authenticate with app-managed credentials
The system SHALL allow administrative users to authenticate with a username and password stored in `CCPro_Desktop.dbo.app_admins`. Admin authentication SHALL support both normal credentials and temporary credentials issued by an authorized recovery flow.

#### Scenario: Successful admin login
- **WHEN** an active admin enters a valid username and correct password
- **THEN** the system authenticates the admin
- **AND** redirects to the admin area

#### Scenario: Admin logs in with a temporary password
- **WHEN** an active admin enters a correct temporary password and `must_change_password = true`
- **THEN** the system authenticates the admin
- **AND** redirects to the admin password-change flow before any other admin action

### Requirement: Admins can change their own password from an authenticated session
The system SHALL allow an authenticated admin to change their own password by providing the current password and a valid new password.

#### Scenario: Successful self-service password change
- **WHEN** an authenticated admin submits the correct current password and a valid new password
- **THEN** the system updates the stored password hash
- **AND** clears `must_change_password`
- **AND** records an admin-auth audit entry

#### Scenario: Wrong current password
- **WHEN** an authenticated admin submits an incorrect current password
- **THEN** the system rejects the change
- **AND** leaves the stored password unchanged

### Requirement: Admin password recovery is controlled and not public
The system SHALL NOT expose a public self-service forgot-password flow on the admin login screen unless a separate identity-verification mechanism exists.

#### Scenario: Admin resets another admin password
- **WHEN** an authorized admin issues a password reset for another admin
- **THEN** the system stores the temporary password hash
- **AND** sets `must_change_password = true`
- **AND** records an admin-auth audit entry

#### Scenario: No admin session is available for recovery
- **WHEN** the environment has no available admin session and an emergency recovery is required
- **THEN** the system provides a local maintenance recovery path outside the public login UI
- **AND** the recovery action is auditable

### Requirement: Admin actions are restricted while password change is pending
The system SHALL block non-authentication admin actions while the authenticated admin is in a forced password-change state.

#### Scenario: Admin with temporary password requests a protected action
- **WHEN** an authenticated admin with `must_change_password = true` invokes an admin-only route or IPC other than password-change or logout
- **THEN** the system denies the request
- **AND** requires the admin to complete password change first
