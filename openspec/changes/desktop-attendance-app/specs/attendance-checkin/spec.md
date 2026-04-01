## ADDED Requirements

### Requirement: Check-in and check-out
The system SHALL allow authenticated employees to record check-in (I) and check-out (O) by clicking a single button. The system SHALL INSERT a record into `WiseEye.dbo.CheckInOut` with `Source='PC'` and the configured `MachineNo`.

#### Scenario: Employee checks in
- **WHEN** employee clicks the check-in button
- **THEN** system INSERTs into `CheckInOut` with `OriginType='I'`, `Source='PC'`, `TimeStr=NOW()`, `TimeDate=TODAY()`, and the employee's `UserEnrollNumber`

#### Scenario: Employee checks out
- **WHEN** employee clicks the check-out button
- **THEN** system INSERTs into `CheckInOut` with `OriginType='O'`, `Source='PC'`, `TimeStr=NOW()`, `TimeDate=TODAY()`, and the employee's `UserEnrollNumber`

#### Scenario: Duplicate check-in prevention
- **WHEN** employee attempts to check-in within 1 minute of their last check-in
- **THEN** system rejects the action with message "Bạn vừa chấm công, vui lòng thử lại sau"

### Requirement: Real-time clock display
The system SHALL display a real-time digital clock on the Dashboard showing current time (HH:mm:ss) updated every second. The time SHALL be synchronized with the system clock.

#### Scenario: Clock accuracy
- **WHEN** Dashboard is displayed
- **THEN** clock shows current system time updated every second with format HH:mm:ss

### Requirement: Current shift information
The system SHALL display the employee's current shift information (Onduty/Offduty times) from `WiseEye.dbo.Shifts` based on the employee's `SchID`.

#### Scenario: Display shift details
- **WHEN** employee views Dashboard
- **THEN** system shows shift name, start time (Onduty), end time (Offduty), and working hours

### Requirement: Daily progress timeline
The system SHALL display a timeline showing today's check-in/check-out events (Vào sáng, Ra trưa, Vào chiều, Ra chiều) with actual times from `CheckInOut` or `--:--` if not yet recorded.

#### Scenario: Partial day progress
- **WHEN** employee has checked in morning but not yet checked out
- **THEN** timeline shows morning check-in time and `--:--` for remaining slots

#### Scenario: Full day complete
- **WHEN** employee has completed all check-in/out events for the day
- **THEN** timeline shows all 4 timestamps filled in
