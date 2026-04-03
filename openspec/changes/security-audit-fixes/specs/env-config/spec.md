## ADDED Requirements

### Requirement: Secrets loaded from environment variables
The system SHALL load all sensitive credentials (SQL password, device password) from environment variables with NO hardcoded fallback values for secrets. Non-secret configuration (server hostname, port numbers) MAY retain hardcoded defaults.

#### Scenario: App starts with env vars set
- **WHEN** `WISEEYE_SQL_PASSWORD` and `ZK_DEVICE_PASSWORD` environment variables are set
- **THEN** the app uses those values for database and device connections

#### Scenario: App starts without required secret env vars
- **WHEN** `WISEEYE_SQL_PASSWORD` is not set (empty or undefined)
- **THEN** the app SHALL fail to connect to the database with a clear error message rather than using a hardcoded password

### Requirement: Per-machine session encryption key
The system SHALL generate a unique 32-byte random hex session encryption key on first launch and persist it in secure local storage. The key MUST NOT be shared across installations.

#### Scenario: First launch on a new machine
- **WHEN** the app launches for the first time and no session key exists in local storage
- **THEN** the system generates a cryptographically random 32-byte hex key and stores it

#### Scenario: Subsequent launches
- **WHEN** the app launches and a session key already exists in local storage
- **THEN** the system uses the stored key (no regeneration)

### Requirement: .env template and .gitignore
The project SHALL include a `.env.example` file documenting all environment variables and `.gitignore` SHALL include `.env` patterns.

#### Scenario: Developer clones the repo
- **WHEN** a developer clones the repository
- **THEN** they find `.env.example` with all required and optional variables documented
- **THEN** `.env` files are excluded from Git tracking

### Requirement: Database name validation
The system SHALL validate the database name from configuration against `/^[a-zA-Z0-9_]+$/` before using it in SQL statements to prevent SQL injection.

#### Scenario: Valid database name
- **WHEN** `CCPRO_APP_DATABASE` is set to `CCPro`
- **THEN** the database initialization proceeds normally

#### Scenario: Malicious database name
- **WHEN** `CCPRO_APP_DATABASE` contains SQL injection characters (e.g., `test'; DROP TABLE--`)
- **THEN** the system throws an error and refuses to proceed

### Requirement: No secrets in log output
The system SHALL NOT log passwords or credentials to console or log files during initialization or seeding.

#### Scenario: Default admin account created
- **WHEN** the app seeds the default admin account
- **THEN** the console log message confirms creation without exposing the password
