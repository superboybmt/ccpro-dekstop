## ADDED Requirements

### Requirement: Attendance history table
The system SHALL display a paginated table of the employee's attendance records from `WiseEye.dbo.CheckInOut`, joined with `Punch` data where available. Table columns SHALL include: Date, Check-in time, Check-out time, Working hours, Status (on-time/late/absent), Shift name.

#### Scenario: View history with data
- **WHEN** employee navigates to History screen
- **THEN** system displays attendance records for the current month, sorted by date descending, paginated (10 per page)

#### Scenario: Empty history
- **WHEN** employee has no attendance records for the selected period
- **THEN** system displays "Không có dữ liệu chấm công trong khoảng thời gian này"

### Requirement: Attendance statistics summary
The system SHALL display summary statistics at the top of the History screen: Total working days, On-time rate (%), Total overtime hours, Number of absences.

#### Scenario: Statistics calculation
- **WHEN** employee views History screen for a given month
- **THEN** system calculates and displays stats from `CheckInOut` and `Punch` tables for that month

### Requirement: Date range filter
The system SHALL allow filtering attendance history by date range (start date, end date) and by month selector.

#### Scenario: Filter by custom date range
- **WHEN** employee selects start date and end date
- **THEN** history table and statistics update to show only records within that range

#### Scenario: Filter by month
- **WHEN** employee selects a month from the month picker
- **THEN** history table shows records for that entire month
