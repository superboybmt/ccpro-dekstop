## ADDED Requirements

### Requirement: Fetch Latest Version Manifest
The system SHALL retrieve the `version.json` file from a configured remote URL on application startup to determine the latest available release. 

#### Scenario: Successful Network Fetch
- **WHEN** the application starts up
- **THEN** it performs an HTTP GET request to the remote version URL
- **AND** it receives a JSON response containing `latest`, `downloadUrl`, and `releaseNotes`

#### Scenario: Network Fetch Fails
- **WHEN** the application starts up and the network is unavailable or the request times out
- **THEN** the system ignores the error cleanly and continues normal operation
- **AND** no update notification is displayed

### Requirement: Version Comparison
The system SHALL compare the retrieved `latest` version against the application's current runtime version.

#### Scenario: New Version Exists
- **WHEN** the `latest` version in the remote manifest is greater than the current app version (`app.getVersion()`)
- **THEN** an IPC event is dispatched to the Renderer process signaling an update is available

#### Scenario: App is Up-to-Date
- **WHEN** the `latest` version is equal to or less than the current app version
- **THEN** no event is dispatched and the update check safely terminates

### Requirement: Display Update Notification
The system SHALL display a non-blocking UI notification to the user when an update is available, allowing them to download the new version.

#### Scenario: Showing the Update Dialog
- **WHEN** the Renderer process receives the update availability event
- **THEN** it displays a Toast notification with the message "Có bản cập nhật mới v[latest]!" and a call-to-action button

#### Scenario: User Clicks to Download
- **WHEN** the user clicks the download button on the notification
- **THEN** the application opens the `downloadUrl` in the user's default OS web browser
- **AND** the notification is dismissed
