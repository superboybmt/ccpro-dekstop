## ADDED Requirements

### Requirement: Admins can read current machine configuration
The system SHALL allow an authenticated admin to read the current attendance-machine configuration from the ZKTeco device, including `StateMode` and the four active auto-switch states used by the app.

#### Scenario: Admin opens machine configuration screen
- **WHEN** an authenticated admin navigates to the machine configuration screen
- **THEN** the system reads the current `StateMode`
- **AND** reads the current auto-switch configuration for `state0`, `state1`, `state2`, and `state3`

### Requirement: The desktop app uses a packaged helper for machine configuration
The system SHALL execute machine-configuration operations through a packaged helper executable instead of invoking development-time PowerShell or Python scripts directly from the Electron app.

#### Scenario: Packaged app runs on another Windows machine
- **WHEN** the app is installed on a different Windows machine
- **THEN** machine-configuration operations run through the packaged helper executable
- **AND** the app does not require raw `.ps1` script paths or a system Python installation to save machine configuration

### Requirement: Admins can update StateMode from the app
The system SHALL allow an authenticated admin to change the machine `StateMode` from the UI and SHALL verify the device value after saving.

#### Scenario: Save StateMode succeeds
- **WHEN** an admin selects a new `StateMode` and clicks save
- **THEN** the system writes the requested mode to the device
- **AND** reads the mode back from the device
- **AND** reports success only if the readback matches the requested mode

#### Scenario: Save StateMode does not verify
- **WHEN** the device write call returns but the readback value does not match the requested mode
- **THEN** the system reports the save as failed or partial
- **AND** does not show a false success state

### Requirement: Admins can update the four-state auto-switch schedule
The system SHALL allow an authenticated admin to configure four daily state switches for the attendance machine and SHALL write the schedule to the device using the verified SSR device-data path.

#### Scenario: Save four-state schedule succeeds
- **WHEN** an admin saves valid times for the four configured states
- **THEN** the system writes the corresponding `statekey`, `statelist`, and `statetimezone` records to the device
- **AND** reads the configuration back from the device
- **AND** reports success only if the readback matches the requested schedule

#### Scenario: Save schedule partially fails
- **WHEN** one or more device-data writes fail or readback does not match
- **THEN** the system reports the operation as failed or partial
- **AND** includes enough detail for the admin to understand which part failed

### Requirement: The app preserves the canonical SSR write path for special keys
The system SHALL use the SSR device-data tables as the source of truth for keys and schedules that are not writable through the legacy shortkey API.

#### Scenario: Admin saves schedule containing midday states
- **WHEN** the requested schedule updates `state2` or `state3`
- **THEN** the system writes the schedule through the SSR device-data path
- **AND** does not rely on `SetShortkey` as the authoritative save path for those states

### Requirement: Machine configuration changes are audited
The system SHALL persist an audit record for every machine-configuration save attempt initiated from the admin UI.

#### Scenario: Successful machine configuration save
- **WHEN** an admin successfully saves mode or schedule changes
- **THEN** the system stores an audit row containing the admin identity, device IP, action, before-state, after-state, and success status

#### Scenario: Failed machine configuration save
- **WHEN** an admin attempts to save a configuration but verification fails
- **THEN** the system stores an audit row containing the attempted change, failure status, and error detail

### Requirement: Admin UI exposes remote-risk policy control
The system SHALL allow an authenticated admin to manage the employee remote-risk enforcement policy from the Admin UI without editing config files or accessing the machine directly.

#### Scenario: Admin turns remote-risk enforcement on
- **WHEN** an admin enables the remote-risk toggle in the Admin UI and saves
- **THEN** the system persists the corresponding app-level policy value
- **AND** subsequent employee punch attempts enforce remote-risk blocking when the risk is high

#### Scenario: Admin turns remote-risk enforcement off
- **WHEN** an admin disables the remote-risk toggle in the Admin UI and saves
- **THEN** the system persists the corresponding app-level policy value
- **AND** the app continues to allow remote-risk detection and audit logging without enforcing punch blocking
