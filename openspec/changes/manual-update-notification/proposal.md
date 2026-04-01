## Why

Electron's built-in `electron-updater` does not support OTA for the "Portable" distribution format. However, keeping the app portable is highly desirable for users who do not want to install it. We need a way to notify users when a new version is available so they can manually download the updated portable executable, ensuring they get bug fixes and new features without forcing a full NSIS installation.

## What Changes

- Fetch a remote `version.json` file on application startup via HTTP.
- Compare the fetched version with the current application version (`app.getVersion()`).
- Display a non-intrusive UI notification (Toast) if a newer version is available.
- Provide a click-to-download action that opens the user's default web browser to the updated executable link.

## Capabilities

### New Capabilities
- `manual-update`: Provide manual update notifications by polling a remote endpoint and prompting users to download the new executable.

### Modified Capabilities
None

## Impact

- **App Initialization:** Adds a lightweight HTTP network request during or shortly after app startup (non-blocking).
- **UI Components:** App layout or toast notification system will need to support rendering update actions.
- **Externals:** Relies on a public/private URI (like a GitHub Raw link) hosting a `version.json` payload.
