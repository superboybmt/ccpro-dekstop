## Context

PNJ chi nhánh có máy chấm công vân tay ZKTeco (10.60.1.5) + SQL Server WiseEye (10.60.1.4) lưu dữ liệu chấm công. DB `WiseEye` có 69 nhân viên, 120K+ records trong `CheckInOut`. Cần Desktop App bổ sung để chấm công trên PC, ghi trực tiếp vào WiseEye DB.

**Hạ tầng hiện tại:**
- SQL Server 10.60.1.4 — DB `WiseEye` (bảng `CheckInOut`, `UserInfo`, `Shifts`)
- ZKTeco 10.60.1.5 — máy vân tay vật lý
- Mã NV format: `E0112599` (field `UserFullCode` trong `UserInfo`)
- CheckInOut dùng `Source='FP'` (vân tay) và `Source='PC'` (thủ công)
- Mockup thiết kế sẵn trên Stitch (5 screens, design system "Luminous Editor")

## Goals / Non-Goals

**Goals:**
- Xây dựng Desktop App (Win/Mac) cho nhân viên chấm công bằng mã NV + password
- Ghi attendance records vào WiseEye `CheckInOut` table (tương thích 100%)
- Tạo DB riêng `CCPro_Desktop` cho auth/settings (không sửa schema WiseEye)
- Implement đúng design system Luminous Editor từ Stitch mockup

**Non-Goals:**
- Không thay thế máy vân tay ZKTeco — đây là phương án bổ sung
- Không xây admin panel quản lý nhân viên — dùng WiseEye software có sẵn
- Không triển khai qua internet — chỉ hoạt động trong mạng LAN
- Không xây mobile app — chỉ desktop

## Decisions

### 1. Framework: Electron + React 19 + Vite
**Rationale:** Mockup sẵn HTML/CSS từ Stitch → dùng trực tiếp. SQL Server cần Node.js driver (`mssql`). Glassmorphism design cần full CSS control.
**Alternatives:**
- Tauri: Bundle nhỏ hơn (~5MB vs ~150MB) nhưng backend Rust, SQL Server driver (`tiberius`) kém stable, team không biết Rust
- .NET MAUI: Native nhưng XAML/C#, không tận dụng được Stitch HTML output

### 2. Database Strategy: Dual-DB
**Rationale:** Không sửa schema WiseEye gốc → tạo DB riêng `CCPro_Desktop` trên cùng server cho auth + app data.
- `WiseEye.dbo.CheckInOut` → INSERT attendance records (READ/WRITE)
- `WiseEye.dbo.UserInfo` → READ danh sách nhân viên
- `CCPro_Desktop.dbo.app_users` → Auth data (password hash, first login flag)

### 3. Auth Flow: Mã NV + bcrypt, default password = mã NV
**Rationale:** Nhân viên quen dùng mã NV. Default password tránh admin phải set pass từng người. Bắt buộc đổi pass lần đầu → bảo mật.

### 4. CheckInOut INSERT Convention
**Rationale:** Giữ nguyên convention WiseEye — `Source='PC'`, `MachineNo` = số PC có sẵn trong data cũ.

### 5. Architecture: Main Process (SQL) + Renderer (React)
```
Electron Main Process (Node.js)
├── SQL Service (mssql) → WiseEye DB + CCPro_Desktop DB
├── IPC handlers (contextBridge)
├── Auto-updater
└── System tray

Electron Renderer (React + Vite)
├── /login → Employee auth
├── /dashboard → Real-time clock + check-in/out
├── /history → Attendance table + stats
├── /notifications → Notification center
└── /settings → Profile + password change
```

### 6. Device Sync Architecture: Embedded Python worker + Electron orchestration
**Rationale:** Thử nghiệm thực tế cho thấy máy ZKTeco 8000T tại `10.60.1.5` đọc được bằng Python `pyzk`, trong khi các Node ZK libraries mở socket được nhưng fail ở bước parse response. Vì vậy worker sync nên dùng Python để giảm rủi ro protocol/firmware.

```
ZKTeco 8000T (10.60.1.5:4370)
          |
          v
Python sync worker (pyzk)
  - connect to device
  - read recent attendance logs
  - map user_id -> UserEnrollNumber
  - dedupe / upsert insert set
  - write sync state + run logs
          |
          v
SQL Server 10.60.1.4
  - WiseEye.dbo.CheckInOut
  - CCPro.dbo.device_sync_state
  - CCPro.dbo.device_sync_runs
          ^
          |
Electron main process
  - spawn/manage worker lifecycle
  - trigger manual retry
  - expose sync status over IPC
          |
          v
Renderer
  - sync status badge
  - "Dong bo lai" action
```

### 7. Sync Modes: background polling + manual retry
**Rationale:** Người dùng cần dữ liệu tự chảy khi app đang mở/tray, nhưng cũng cần một nút chủ động retry khi nghi ngờ sync bị trễ.

- **Background mode:** worker chạy một vòng sync ngay sau khi app sẵn sàng, sau đó poll mỗi 30-60 giây
- **Manual mode:** UI gửi IPC để trigger "run now" trên cùng worker, không spawn worker mới nếu một run đang diễn ra
- **Single-flight:** chỉ cho phép 1 sync run tại một thời điểm để tránh race condition và duplicate writes

### 8. Cursor and idempotency strategy
**Rationale:** Máy hiện có ~99k logs, nên không thể full-sync mỗi lần. Sync phải incremental và an toàn khi retry.

- `device_sync_state` lưu:
  - `device_ip`
  - `last_sync_at`
  - `last_log_uid`
  - `last_log_time`
  - `last_status`
  - `last_error`
- `device_sync_runs` lưu lịch sử từng lần chạy:
  - `started_at`
  - `finished_at`
  - `imported_count`
  - `skipped_count`
  - `error_message`
- Rule chống trùng khi insert vào `CheckInOut`:
  - coi một log là đã tồn tại nếu cùng `UserEnrollNumber + TimeStr + Source='FP' + MachineNo`
- Bootstrap strategy:
  - lần đầu chỉ sync một cửa sổ giới hạn, ví dụ 3-7 ngày gần nhất
  - không backfill toàn bộ `99k` logs trong lần rollout đầu

### 9. User mapping strategy
**Rationale:** Máy trả `user_id` dạng số (`45`, `36`, ...), trong khi app và SQL dùng `UserEnrollNumber` / `UserFullCode`.

- Mapping ưu tiên:
  - `device user_id` -> `WiseEye.UserInfo.UserEnrollNumber`
- Nếu không tìm thấy mapping:
  - bỏ qua record
  - ghi warning vào `device_sync_runs`
- Không tự tạo user mới trong WiseEye

### 10. UI integration
**Rationale:** Người dùng cần nhìn thấy trạng thái sync rõ ràng nhưng không bị ngợp bởi chi tiết kỹ thuật.

- Top header:
  - badge `Sync OK / Dang sync / Loi`
  - nút `Dong bo lai`
- Settings/App info:
  - `last sync at`
  - `last imported count`
  - `last error`
- Dashboard refresh:
  - sau manual retry thành công, app reload dashboard/history/notifications

## Risks / Trade-offs

- **[SQL Server credentials in app]** → Mitigation: Dùng connection pool, credentials encrypted trong app config, không expose ra renderer process (chỉ qua IPC)
- **[WiseEye schema thay đổi]** → Mitigation: App chỉ INSERT/SELECT, không ALTER. Validate schema on startup
- **[Electron bundle lớn ~150MB]** → Mitigation: Acceptable cho internal desktop app. Dùng `electron-builder` để optimize
- **[User chấm công fake (không có mặt)]** → Mitigation: Phase 1 chấp nhận trust-based. Phase 2 có thể thêm IP whitelist hoặc MAC address check
- **[Network dependency]** → Mitigation: App check SQL connection on startup, hiển thị rõ lỗi kết nối
- **[ZKTeco protocol mismatch across libraries]** → Mitigation: Chuẩn hóa worker trên Python `pyzk`, không phụ thuộc Node ZK libs cho production path
- **[Large attendance volume on device]** → Mitigation: Incremental cursor-based sync, giới hạn bootstrap window
- **[Worker lifecycle inside Electron]** → Mitigation: single child-process owner ở main process, restart có kiểm soát, ghi log trạng thái vào DB
