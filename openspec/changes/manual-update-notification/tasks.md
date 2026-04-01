## 1. Version & Update Checking (Main Process)

- [x] 1.1 Create generic utility for basic semver comparison (greater than, less than, equal)
- [x] 1.2 Create `update-service.ts` in `src/main/services/`
- [x] 1.3 Implement HTTP fetch method in `update-service` that queries the configured GitHub/remote `version.json` (with cache-busting)
- [x] 1.4 Implement comparison logic: fetch `latest`, compare with `app.getVersion()`. If `latest > current`, emit an update event
- [x] 1.5 Expose an IPC handler in `register-handlers.ts` to allow the Renderer to start the check and listen to `on-update-available` events
- [x] 1.6 Add a system `shell.openExternal` wrapper via IPC, allowing the Renderer to safely open web links

## 2. Notification UI (Renderer Process)

- [x] 2.1 Create a new hook, e.g., `useUpdateNotifier.ts` or a transparent global component in `App.tsx`
- [x] 2.2 Inside the hook, call the IPC method on mount to trigger the update check
- [x] 2.3 Listen for the `on-update-available` event over IPC
- [x] 2.4 Display a Toast UI when the event is received, including version info and the update Call-to-Action
- [x] 2.5 Plumb the "Download" button click to trigger the `shell.openExternal` IPC call with the `downloadUrl` provided by the payload
