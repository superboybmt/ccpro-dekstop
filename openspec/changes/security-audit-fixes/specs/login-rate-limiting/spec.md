## ADDED Requirements

### Requirement: Login attempt rate limiting
The system SHALL track failed login attempts per identifier (employee code for user login, username for admin login) and enforce temporary lockouts after exceeding thresholds.

#### Scenario: User fails 5 consecutive login attempts
- **WHEN** a user fails authentication 5 times within a rolling 15-minute window
- **THEN** further login attempts for that identifier are blocked for 5 minutes
- **THEN** the error message indicates the account is temporarily locked

#### Scenario: User fails 10 consecutive login attempts
- **WHEN** a user fails authentication 10 times within a rolling 60-minute window
- **THEN** further login attempts for that identifier are blocked for 30 minutes

#### Scenario: Successful login resets failure counter
- **WHEN** a user successfully authenticates
- **THEN** the failure counter for that identifier is reset to zero

#### Scenario: Lockout expires
- **WHEN** the lockout duration has elapsed since the last failed attempt
- **THEN** the user can attempt login again

### Requirement: Rate limiter is in-memory
The rate limiter SHALL use an in-memory data structure (no external dependencies). It is acceptable for the rate limiter state to reset when the application restarts.

#### Scenario: App restarts during lockout
- **WHEN** a user is locked out and the application restarts
- **THEN** the lockout is cleared and the user can attempt login again
