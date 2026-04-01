## ADDED Requirements

### Requirement: Admin can manually synchronize device time
The system SHALL provide a mechanism in the Admin Device Config page for administrators to synchronize the physical time of the attendance device with the server's current time.

#### Scenario: Successful time synchronization
- **WHEN** the admin clicks the "Đồng bộ Giờ" (Sync Time) button
- **THEN** the system invokes the `machine-config-helper.exe` with the `sync-time` command
- **THEN** the device's clock is updated to match the server clock
- **THEN** a success message is displayed to the admin

#### Scenario: Failed time synchronization
- **WHEN** the admin clicks the "Đồng bộ Giờ" (Sync Time) button but the device is unreachable
- **THEN** the system catches the timeout or connection error from the helper
- **THEN** an error message is displayed to the admin indicating the failure

### Requirement: Time synchronization logging
The system SHALL record an audit log entry in the database whenever a time synchronization command is successfully executed.

#### Scenario: Logging a successful sync
- **WHEN** the time synchronization is successful
- **THEN** an entry is created in the audit log noting the admin user and the action performed
