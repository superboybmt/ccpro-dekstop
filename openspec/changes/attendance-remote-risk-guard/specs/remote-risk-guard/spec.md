## ADDED Requirements

### Requirement: The app evaluates remote-control risk before punch actions
The system SHALL evaluate remote-control risk on the employee desktop before processing a punch action.

#### Scenario: Risk evaluation runs at punch time
- **WHEN** an authenticated employee attempts to check in or check out
- **THEN** the system evaluates remote-risk signals on the desktop before deciding whether to allow the action

### Requirement: Remote-risk uses multiple high-confidence signals
The system SHALL NOT classify a punch attempt as high-risk based only on the existence of a remote-control process. The system SHALL require multiple signals to classify a punch attempt as high-risk.

#### Scenario: Process-only signal is low risk
- **WHEN** a denylisted remote-control process exists on the machine
- **AND** no active signal is present near the punch attempt
- **THEN** the system classifies the situation as low risk
- **AND** does not block the punch based only on the process existence

#### Scenario: Multiple signals create high risk
- **WHEN** a denylisted remote-control process exists
- **AND** the system detects an active remote-control signal
- **AND** the signal occurs near the punch attempt
- **THEN** the system classifies the situation as high risk

### Requirement: The app recognizes a denylist of remote-control tools
The system SHALL evaluate at least the configured denylist of remote-control tools in phase 1.

#### Scenario: Known remote-control tool is detected
- **WHEN** one of the configured remote-control tools is present on the desktop
- **THEN** the system includes that process in the remote-risk evaluation result

### Requirement: Suspicious and blocked punch attempts are audited
The system SHALL store an audit record for punch attempts that are classified as suspicious or blocked due to remote-risk.

#### Scenario: Suspicious attempt is allowed
- **WHEN** a punch attempt is classified as medium risk
- **THEN** the system allows the punch
- **AND** stores an audit record with the risk signals that were observed

#### Scenario: High-risk attempt is blocked
- **WHEN** a punch attempt is classified as high risk
- **THEN** the system blocks the punch
- **AND** stores an audit record with the risk level, observed signals, attempted action, and timestamp

### Requirement: The app informs the employee when remote-risk blocks a punch
The system SHALL provide a user-visible reason when a punch action is blocked due to high remote-risk.

#### Scenario: Employee sees block reason
- **WHEN** a punch attempt is blocked because remote-risk is high
- **THEN** the system returns a message explaining that punch is unavailable while a remote-control session is actively detected

### Requirement: Remote-risk enforcement policy is configurable by admin
The system SHALL support an admin-configurable enforcement policy for remote-risk so that detection can continue while punch blocking is temporarily disabled.

#### Scenario: Policy is audit only
- **WHEN** the configured remote-risk policy is `audit_only`
- **THEN** the system continues to evaluate remote-risk signals
- **AND** stores suspicious or high-risk audit data
- **AND** does not block employee punch actions based on remote-risk

#### Scenario: Policy blocks high risk
- **WHEN** the configured remote-risk policy is `block_high_risk`
- **THEN** the system evaluates remote-risk signals
- **AND** blocks employee punch actions when the risk level is high
