## ADDED Requirements

### Requirement: Sync attendance logs from ZKTeco device to SQL Server
The system SHALL connect to the ZKTeco attendance device at `10.60.1.5:4370`, read attendance logs, and persist new machine-originated punches into `WiseEye.dbo.CheckInOut` on SQL Server `10.60.1.4`.

#### Scenario: Background sync imports new logs
- **WHEN** the background sync worker runs and the device has new attendance logs
- **THEN** the system inserts the new records into `WiseEye.dbo.CheckInOut`
- **AND** inserted records are marked with `Source='FP'`

#### Scenario: Manual retry imports pending logs
- **WHEN** the user clicks "Dong bo lai"
- **THEN** the system triggers an immediate sync run
- **AND** any pending new logs from the device are imported into SQL Server

### Requirement: Maintain sync cursor and run state
The system SHALL persist sync state in the app database so it can continue from the most recent imported device log instead of re-reading the entire device history on every run.

#### Scenario: Resume from previous sync point
- **WHEN** a background sync run starts after a previous successful run
- **THEN** the worker reads the last persisted cursor
- **AND** processes only logs newer than the saved cursor

#### Scenario: Track sync result
- **WHEN** a sync run completes
- **THEN** the system stores the run status, imported count, skipped count, and any error message

### Requirement: Prevent duplicate imports
The system SHALL avoid creating duplicate `CheckInOut` rows when the same machine log is encountered again during retry or overlapping sync windows.

#### Scenario: Retry sees an already imported punch
- **WHEN** the worker processes a log that already exists in `WiseEye.dbo.CheckInOut`
- **THEN** the system skips inserting a duplicate row
- **AND** the sync run counts the record as skipped

### Requirement: Map device users to WiseEye employees
The system SHALL map the attendance device `user_id` to `WiseEye.UserInfo.UserEnrollNumber` before inserting a punch into SQL Server.

#### Scenario: Matching employee exists
- **WHEN** a device log arrives for `user_id=45`
- **AND** `WiseEye.UserInfo` contains `UserEnrollNumber=45`
- **THEN** the imported record uses `UserEnrollNumber=45`

#### Scenario: No employee mapping exists
- **WHEN** a device log arrives for a `user_id` that does not exist in `WiseEye.UserInfo`
- **THEN** the worker skips that record
- **AND** stores a warning in sync run diagnostics

### Requirement: Expose sync status to the app UI
The system SHALL expose device sync status to the Electron renderer so users can see whether sync is healthy and trigger manual retry.

#### Scenario: User views sync health
- **WHEN** the app shell is displayed
- **THEN** the UI shows the last sync time and current sync status

#### Scenario: Sync is currently running
- **WHEN** a background or manual sync run is in progress
- **THEN** the UI reflects a "Dang sync" state
- **AND** the app does not start a second overlapping run
