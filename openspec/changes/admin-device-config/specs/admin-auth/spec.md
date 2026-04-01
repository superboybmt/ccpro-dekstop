## ADDED Requirements

### Requirement: Admins authenticate with app-managed credentials
The system SHALL allow administrative users to authenticate with a username and password stored in `CCPro_Desktop.dbo.app_admins`. Admin authentication SHALL NOT depend on `WiseEye.UserInfo` or employee codes such as `E01xxxxx`.

#### Scenario: Successful admin login
- **WHEN** an active admin enters a valid username and correct password
- **THEN** the system authenticates the admin
- **AND** redirects to the admin device configuration screen

#### Scenario: Invalid admin credentials
- **WHEN** an admin enters an unknown username or wrong password
- **THEN** the system rejects the login
- **AND** shows a generic invalid-credentials message

#### Scenario: Inactive admin account
- **WHEN** an admin account exists but `is_active = false`
- **THEN** the system rejects the login
- **AND** does not create a session

### Requirement: Admin sessions are isolated from employee sessions
The system SHALL maintain admin sessions separately from employee sessions so that admin-only routes and IPC handlers cannot be accessed through an employee-authenticated session.

#### Scenario: Employee session accesses admin route
- **WHEN** an authenticated employee attempts to open an admin-only route or invoke an admin-only IPC handler
- **THEN** the system denies access
- **AND** requires an admin-authenticated session

#### Scenario: Admin session accesses employee flow
- **WHEN** an authenticated admin opens the app
- **THEN** the system lands on admin routes
- **AND** does not treat the admin as an employee user

### Requirement: The app supports bootstrap of the first admin account
The system SHALL provide an app-managed way to create the initial admin account for the environment without requiring a WiseEye employee record.

#### Scenario: First admin is created
- **WHEN** the environment has no existing admin accounts
- **THEN** the system allows an authorized bootstrap path to create the first admin with a username, password hash, role, and active status

#### Scenario: Additional admin is added later
- **WHEN** an authorized maintenance path creates another admin account
- **THEN** the system stores the new account in `dbo.app_admins`
- **AND** the account can authenticate independently of employee data

### Requirement: Admin actions are authorized by admin role
The system SHALL require an authenticated admin session before any machine-configuration action can be read or saved from the app.

#### Scenario: Unauthenticated caller requests machine config
- **WHEN** no admin session exists and a machine-config API is invoked
- **THEN** the system rejects the request

#### Scenario: Authenticated admin requests machine config
- **WHEN** an authenticated admin opens the machine configuration screen
- **THEN** the system allows the request
- **AND** returns the current machine configuration data
