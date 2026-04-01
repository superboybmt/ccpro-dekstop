## Context

The CCPro desktop app is distributed as a Portable Windows Executable. Because it extracts to a temporary directory each time, standard OTA diff-updating (via `electron-updater`) is unsupported. We still need to notify users when a new version is available on our distribution platform (like GitHub) so they can download it.

## Goals / Non-Goals

**Goals:**
- Provide a reliable check on startup to see if a newer version of the app exists.
- Show a polite, non-blocking notification to the user if an update is found.
- Provide a direct link to the download page or executable.

**Non-Goals:**
- Automatically downloading or installing the new version.
- Handling differential/delta updates (patching only changed files).

## Decisions

1. **Where to check for updates (The `main` process):**
   - **Rationale:** We will fetch the version manifest from the `main` process using Node's native `fetch` or `net` module. This naturally bypasses any Renderer CORS restrictions and gives us easy access to `app.getVersion()` and `shell.openExternal()`.
   - **Alternative:** Fetching from the Renderer. Rejected because it requires passing `app.getVersion()` down anyway, and `shell.openExternal` is natively a main-process feature.

2. **Version Manifest Format:**
   - **Rationale:** A simple static `version.json` file hosted on a public server or GitHub.
   ```json
   {
     "latest": "1.0.1",
     "downloadUrl": "https://github.com/...",
     "releaseNotes": "Bug fixes"
   }
   ```

3. **Comparison Logic:**
   - **Rationale:** We will use a basic semver string comparison. If `remote.latest` > `app.getVersion()`, we trigger the update flow.

4. **UI Notification:**
   - **Rationale:** The `main` process sends an IPC event (e.g., `on-update-available`) to the `renderer`. The React app listens for this event globally (e.g., in `App.tsx` or a dedicated `UpdateNotifier` hook) and displays a Toast notification using the existing UI components. Clicking the toast sends an IPC message back to open the `downloadUrl`.

## Risks / Trade-offs

- **Risk: Network Failure or Slow Fetch** 
  - *Mitigation:* The fetch must be asynchronous and fail silently without blocking app startup. A timeout (e.g., 5 seconds) should be enforced.
- **Risk: Stale Cache**
  - *Mitigation:* HTTP requests fetching the `version.json` should append a cache-busting query parameter (e.g., `?t={Date.now()}`) to ensure we don't get a cached old version.
