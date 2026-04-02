## ADDED Requirements

### Requirement: Admin can list all shifts
The system SHALL display a list of all shifts from WiseEye `dbo.Shifts` table in the Admin UI "Hệ thống" tab. Each row SHALL show: ShiftID, ShiftCode, ShiftName (from Schedule), Onduty, Offduty, OnLunch, OffLunch.

#### Scenario: Shifts loaded successfully
- **WHEN** admin navigates to "Hệ thống" tab
- **THEN** system queries `dbo.Shifts` joined with `dbo.Schedule` and `dbo.WSchedules` and displays all shifts in a table

#### Scenario: No shifts exist
- **WHEN** admin navigates to "Hệ thống" tab and WiseEye DB has no shifts
- **THEN** system displays an empty state message "Không tìm thấy ca làm việc"

#### Scenario: Database connection fails
- **WHEN** WiseEye DB is unreachable
- **THEN** system displays an error toast and shifts table shows error state

---

### Requirement: Admin can inline-edit shift times
The system SHALL allow admin to edit Onduty, Offduty, OnLunch, and OffLunch directly in the table by clicking on a time cell, which transforms into a time input (`<input type="time">`).

#### Scenario: Edit Onduty time
- **WHEN** admin clicks on an Onduty cell showing "07:30"
- **THEN** cell becomes an editable time input pre-filled with "07:30"
- **WHEN** admin changes value to "08:00"
- **THEN** cell shows modified state (visual indicator) and change is tracked locally

#### Scenario: Edit OnLunch to add lunch break
- **WHEN** admin clicks on an OnLunch cell showing "--" (null)
- **THEN** cell becomes an editable time input (empty)
- **WHEN** admin enters "11:30"
- **THEN** cell shows "11:30" with modified state indicator

#### Scenario: Clear OnLunch to remove lunch break
- **WHEN** admin clears the OnLunch time input (backspace or clear)
- **THEN** cell reverts to "--" (will be saved as NULL)

---

### Requirement: Admin can save shift changes
The system SHALL provide a "Lưu thay đổi" button that persists all modified shift times to WiseEye `dbo.Shifts` via UPDATE statements.

#### Scenario: Save modified shifts
- **WHEN** admin has modified shift times and clicks "Lưu thay đổi"
- **THEN** system UPDATEs only the modified shifts in `dbo.Shifts`
- **THEN** system displays success toast
- **THEN** modified indicators are cleared

#### Scenario: No changes to save
- **WHEN** admin clicks "Lưu thay đổi" without modifying any shifts
- **THEN** button is disabled (nothing to save)

#### Scenario: Save fails due to DB error
- **WHEN** admin clicks "Lưu thay đổi" and the UPDATE query fails
- **THEN** system displays error toast with failure reason
- **THEN** modified values remain in the form (not cleared)

---

### Requirement: Shift changes are audited
The system SHALL log every shift time modification to `dbo.shift_audit_logs` (App DB) with admin ID, shift ID, before values, after values, and timestamp.

#### Scenario: Audit log created on save
- **WHEN** admin saves modified shift with Onduty changed from "07:30" to "08:00"
- **THEN** system inserts a record into `shift_audit_logs` with admin_id, shift_id, before_json containing previous values, after_json containing new values, and created_at timestamp

---

### Requirement: Admin authorization required
The system SHALL require admin authentication and authorization (ensureAdminAuthorized) for all shift management operations.

#### Scenario: Unauthenticated admin
- **WHEN** an unauthenticated request calls admin-shifts:list or admin-shifts:update
- **THEN** system throws "Phiên đăng nhập admin đã hết hạn"

#### Scenario: Admin must change password first
- **WHEN** admin with mustChangePassword flag calls shift management endpoints
- **THEN** system throws "Admin cần đổi mật khẩu trước khi tiếp tục"
