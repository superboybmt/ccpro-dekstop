## MODIFIED Requirements

### Requirement: Check-in and check-out
The system SHALL allow authenticated employees to record check-in (I) and check-out (O) by clicking a single button only when the application can reach the internal SQL Server required to persist the punch. The system SHALL INSERT a record into `WiseEye.dbo.CheckInOut` with `Source='PC'` and the configured `MachineNo`. The system SHALL evaluate remote-risk before every punch action and SHALL block the punch when the remote-risk level is high at the time of the attempt.

#### Scenario: Employee checks in
- **WHEN** employee clicks the check-in button
- **AND** SQL connectivity is available
- **AND** remote-risk is not classified as high
- **THEN** system INSERTs into `CheckInOut` with `OriginType='I'`, `Source='PC'`, `TimeStr=NOW()`, `TimeDate=TODAY()`, and the employee's `UserEnrollNumber`

#### Scenario: Employee checks out
- **WHEN** employee clicks the check-out button
- **AND** SQL connectivity is available
- **AND** remote-risk is not classified as high
- **THEN** system INSERTs into `CheckInOut` with `OriginType='O'`, `Source='PC'`, `TimeStr=NOW()`, `TimeDate=TODAY()`, and the employee's `UserEnrollNumber`

#### Scenario: SQL connectivity unavailable blocks punch before submit
- **WHEN** the application cannot connect to the internal SQL Server
- **THEN** the punch button is disabled in the UI
- **AND** the system shows a message explaining that punch is unavailable until internal network / SQL connectivity is restored

#### Scenario: Duplicate check-in prevention
- **WHEN** employee attempts to check-in within 1 minute of their last check-in
- **THEN** system rejects the action with message "Bạn vừa chấm công, vui lòng thử lại sau"

#### Scenario: High remote-risk blocks punch
- **WHEN** employee clicks the check-in button or check-out button
- **AND** SQL connectivity is available
- **AND** remote-risk is classified as high
- **THEN** system rejects the action
- **AND** does not INSERT a `CheckInOut` row
- **AND** returns a message explaining that punch is blocked while active remote-control risk is detected
