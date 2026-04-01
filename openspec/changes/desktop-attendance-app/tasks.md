## 1. Project Setup & UI Foundation

- [x] 1.1 Initialize Electron + React + Vite project using `electron-vite` boilerplate
- [x] 1.2 Install UI dependencies: `react-router-dom`, `lucide-react` (icons), `clsx`, `tailwind-merge` (if using Tailwind)
- [x] 1.3 Setup routing structure (/login, /dashboard, /history, /notifications, /settings)
- [x] 1.4 Implement "Luminous Editor" CSS design tokens (colors, typography, glassmorphism, spacing)
- [x] 1.5 Create reusable UI components: Button (primary/secondary/ghost), Input (recessed well), Card (frosted pane), Avatar

## 2. Layout Shell & Navigation

- [x] 2.1 Build the persistent Sidebar navigation component with active route styling
- [x] 2.2 Build the main App Shell layout wrapping the sidebar and content area
- [x] 2.3 Implement the Top Header (Greeting, User Info snippet, Notification Bell indicator)

## 3. Pixel Perfect Screens (Mockup Implementation)

- [x] 3.1 Build Login Screen (employee code + password fields, logo, glassmorphism background)
- [x] 3.2 Build Dashboard Screen (real-time clock widget, shift info card, daily progress timeline, check-in/out buttons)
- [x] 3.3 Build History Screen (statistics summary cards, paginated attendance table with status pills)
- [x] 3.4 Build Notifications Screen (notification list items with unread dots and timestamp styling)
- [x] 3.5 Build Settings Screen (profile information display, password change form, logout button)

## 4. Backend Integration Setup

- [x] 4.1 Install backend dependencies: `mssql`, `bcryptjs`, `electron-store`
- [x] 4.2 Configure Electron main process with IPC bridge (contextBridge/preload)
- [x] 4.3 Setup dual SQL Server connection config (WiseEye + CCPro_Desktop)
- [x] 4.4 Create `CCPro_Desktop` database on SQL Server 10.60.1.4 and execute initial schema creation (app_users, app_notifications)

## 5. Auth Flow Integration (employee-auth)

- [x] 5.1 Implement IPC handler for `WiseEye.UserInfo` validation
- [x] 5.2 Implement default password check & `app_users` password hash verification
- [x] 5.3 Wire up the Login screen to the auth IPC handlers
- [x] 5.4 Implement the "force password change" flow on first login
- [x] 5.5 Implement session persistence (`electron-store`) and Auth Guard on routes

## 6. Attendance Integration (attendance-checkin & history)

- [x] 6.1 Wire up Dashboard shift info to `WiseEye.Shifts` via IPC
- [x] 6.2 Implement Check-in/Check-out IPC handlers (INSERT to `CheckInOut`) and wire to Dashboard buttons
- [x] 6.3 Implement IPC handler to fetch today's timeline and wire to Dashboard timeline UI
- [x] 6.4 Implement History IPC handler (query `CheckInOut` + stats) and wire to History screen table/cards
- [x] 6.5 Wire up History date filters to query parameters

## 7. Notifications & Settings Integration

- [x] 7.1 Implement IPC handlers for Late/Missing check-out detection logic
- [x] 7.2 Wire up Notifications screen to fetch and mark read status in `app_notifications`
- [x] 7.3 Wire up Settings profile data to `WiseEye.UserInfo`
- [x] 7.4 Wire up password change form to update `app_users` hash
- [x] 7.5 Implement system tray integration (optional extra)

## 8. Polish & Testing

- [x] 8.1 Test full flow: login → force pass change → check-in → check-out → view history
- [x] 8.2 Verify offline/SQL error handling states in the UI
- [ ] 8.3 Verify CheckInOut records appear correctly in official WiseEye software
- [x] 8.4 Build Electron installers (Windows/macOS)

## 9. Device Sync Capability

- [x] 9.1 Add `device-sync` spec and update proposal/design artifacts for ZKTeco -> SQL sync
- [x] 9.2 Add app DB schema for `device_sync_state` and `device_sync_runs`
- [x] 9.3 Create Python sync worker using `pyzk` for device `10.60.1.5:4370`
- [x] 9.4 Implement user mapping from device `user_id` to `WiseEye.UserInfo.UserEnrollNumber`
- [x] 9.5 Implement cursor-based incremental sync and duplicate-safe INSERT into `WiseEye.dbo.CheckInOut`
- [x] 9.6 Add Electron main-process orchestration for worker lifecycle and background polling
- [x] 9.7 Add IPC endpoints for sync status and manual retry
- [x] 9.8 Add UI status indicator + "Dong bo lai" action in the shell/header
- [x] 9.9 Verify end-to-end flow with real device logs appearing in SQL `10.60.1.4`
- [x] 9.10 Bundle Windows device-sync runtime as a self-contained worker executable
