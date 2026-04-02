## 1. Shared Types & DB Init

- [x] 1.1 Add `AdminShiftItem`, `AdminShiftList`, `AdminShiftUpdatePayload` interfaces to `src/shared/api.ts`
- [x] 1.2 Add `adminShifts` namespace to `RendererApi` interface in `src/shared/api.ts`
- [x] 1.3 Create `shift_audit_logs` table in `src/main/db/init.ts` (App DB)

## 2. Backend Service

- [x] 2.1 Create `src/main/services/admin-shift-service.ts` with `AdminShiftService` class and `SqlAdminShiftRepository`
- [x] 2.2 Implement `listShifts()` -> query `dbo.Shifts` joined with `dbo.Schedule` + `dbo.WSchedules` from WiseEye DB
- [x] 2.3 Implement `updateShifts()` -> UPDATE `dbo.Shifts` on WiseEye DB + write audit log to App DB
- [x] 2.4 Add unit tests for `AdminShiftService`

## 3. IPC & Preload Bridge

- [x] 3.1 Register `admin-shifts:list` and `admin-shifts:update` handlers in `src/main/ipc/register-handlers.ts` with `ensureAdminAuthorized` guard
- [x] 3.2 Add `adminShifts.listShifts()` and `adminShifts.updateShift()` to preload bridge in `src/preload/index.ts`

## 4. Admin UI - Tab Hệ thống

- [x] 4.1 Refactor tab `Hệ thống` in `admin-device-config-page.tsx`: compact `Đồng bộ Giờ` card
- [x] 4.2 Add `Ca làm việc` card with inline-editable shift table
- [x] 4.3 Add shift loading state, error handling, and save flow with toast messages
- [x] 4.4 Track dirty state per shift row and enable `Lưu thay đổi` only when changes exist

## 5. Shared Temporal Inputs

- [x] 5.1 Create shared renderer components `DatePicker`, `TimePicker`, `DateTimePicker`
- [x] 5.2 Standardize display format across app: `dd/MM/yyyy`, `HH:mm`, `dd/MM/yyyy HH:mm`
- [x] 5.3 Implement `TimePicker` as a custom hybrid control: typed input + quick-pick popup
- [x] 5.4 Use `5-minute` quick-pick steps by default, but preserve manually typed valid values such as `07:32`
- [x] 5.5 Compose `DateTimePicker` from `DatePicker` + `TimePicker` instead of a monolithic control
- [x] 5.6 Migrate admin shift editor off native time inputs onto shared temporal components
- [x] 5.7 Plan incremental migration for remaining date/time screens in renderer
- [x] 5.8 Create shared renderer component `MonthPicker` with canonical `YYYY-MM` storage and VN display `MM/yyyy`
- [x] 5.9 Migrate `HistoryPage` filters off native `month/date` inputs onto shared temporal components
- [x] 5.10 Migrate `Lịch Auto-Switch` in tab `Máy chấm công` off native time inputs onto shared `TimePicker`
- [x] 5.11 Render shared temporal popovers through a portal, clamp them to the viewport, and allow reopen on repeated input clicks
- [x] 5.12 Keep optional date-range fields neutral when empty instead of showing validation errors immediately

## 6. Verification

- [x] 6.1 Unit tests pass
- [x] 6.2 Production build passes (`electron-vite build`)
- [ ] 6.3 Manual test: load shifts, inline edit, save, verify DB updated
- [ ] 6.4 Manual test: nullable `OnLunch` / `OffLunch` (clear + save)
- [ ] 6.5 Verify audit trail records created in App DB after save
- [x] 6.6 Verify shared temporal inputs keep canonical storage values while showing VN display formats
- [x] 6.7 Verify `HistoryPage` keeps canonical query params (`month`, `start`, `end`) while showing VN display formats
- [x] 6.8 Verify `Lịch Auto-Switch` keeps canonical `HH:mm` payloads while using shared `TimePicker`
- [x] 6.9 Add regression tests for temporal popover portal rendering and reopen behavior
- [x] 6.10 Add regression tests for empty optional range fields remaining neutral
