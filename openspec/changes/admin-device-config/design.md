## Context

Auth hiện tại gắn chặt với nhân viên WiseEye: login bằng `employeeCode`, lookup từ `WiseEye.UserInfo`, và password hash lưu ở `dbo.app_users`. Session hiện cũng chỉ biết một kiểu user là nhân viên. Trong khi đó, cấu hình máy chấm công là thao tác hệ thống, có rủi ro cao và đã được prove là có thể thay đổi trực tiếp trên máy thật qua `StateMode` và `SSR_*DeviceData`.

Phần machine-config hiện đã có nền kỹ thuật đủ dùng:
- `zk-state-mode.py` để đọc/ghi `StateMode`
- `zk-ssr-device-data-tool.ps1` để đọc/ghi `statekey`, `statelist`, `statetimezone`
- `zk-apply-hc-auto-switch.ps1` để apply preset 4 mốc và verify

Vấn đề còn thiếu là lớp sản phẩm: admin identity riêng, route/UI riêng, IPC/service riêng, và audit log cho thay đổi live.

## Goals / Non-Goals

**Goals:**
- Tách admin auth khỏi employee auth
- Cho phép admin đọc cấu hình hiện tại từ máy và lưu lại cấu hình mới từ UI
- Hỗ trợ đầy đủ hai thao tác chính:
  - đổi `StateMode`
  - cấu hình 4 mốc auto-switch cho `state0..state3`
- Ghi audit log cho mọi lần save cấu hình
- Giữ employee flow hiện tại không bị ảnh hưởng

**Non-Goals:**
- Không làm multi-device trong phase 1
- Không thay employee login bằng RBAC tổng quát
- Không build user-management đầy đủ cho admin ngoài create/disable cơ bản
- Không expose script/tool trực tiếp cho renderer

## Decisions

### 1. Tách hẳn `app_admins`, không nhét admin vào `app_users`
`app_users` hiện có identity là `user_enroll_number`, rõ ràng là domain nhân viên. Nhét `is_admin` vào đây sẽ làm role hệ thống phụ thuộc dữ liệu WiseEye và khiến quyền admin biến động theo lifecycle nhân sự. `app_admins` tách riêng sạch hơn, đúng domain hơn, và cho phép có admin IT không tồn tại trong `UserInfo`.

Schema phase 1:
- `dbo.app_admins`
  - `id`
  - `username`
  - `password_hash`
  - `display_name`
  - `role`
  - `is_active`
  - `last_login_at`
  - `created_at`
  - `updated_at`
- `dbo.device_config_audit_logs`
  - `id`
  - `admin_id`
  - `device_ip`
  - `action`
  - `before_json`
  - `after_json`
  - `status`
  - `error_message`
  - `created_at`
- `dbo.app_settings` hoặc bảng settings tương đương
  - `setting_key`
  - `setting_value`
  - `updated_at`

### 2. Session admin tách khỏi session nhân viên, nhưng dùng cùng session store
Không cần hai store khác nhau. Cách gọn nhất là đổi session payload sang discriminated principal:

```text
session.principal.type = employee | admin
```

Employee session giữ nguyên dữ liệu cũ. Admin session có tập field riêng tối thiểu (`id`, `username`, `displayName`, `role`). IPC guard sẽ tách thành:
- `ensureEmployeeAuthenticated()`
- `ensureAdminAuthenticated()`

Như vậy không làm vỡ employee flow hiện tại nhưng vẫn chặn đúng quyền.

### 3. Admin UI là route riêng, không trộn với employee shell
Phase 1 nên có các route riêng:
- `/admin/login`
- `/admin/device-config`

Lý do:
- quyền khác domain
- layout khác mục đích
- tránh vô tình lộ action cấu hình máy vào shell nhân viên

Admin page chỉ cần:
- đọc `StateMode` hiện tại
- đọc 4 state schedule hiện tại
- chỉnh mode
- chỉnh 4 giờ
- bật/tắt policy enforcement cho remote-risk guard
- save
- hiển thị verify/readback và lỗi nếu có

### 4. Main process gọi helper executable riêng cho machine-config
Renderer chỉ gọi IPC. Main process sẽ bọc machine-config thành service typed rõ ràng:
- `getDeviceConfig()`
- `setStateMode(mode)`
- `setAutoSwitchSchedule(schedule)`
- `saveDeviceConfig(payload)` để save mode + schedule theo flow có kiểm soát

Nhưng implementation phase 1 sẽ không gọi `ps1` hay `python` trực tiếp từ app. Thay vào đó, app chỉ gọi một binary riêng:
- `machine-config-helper.exe`

Helper này chịu trách nhiệm bao toàn bộ logic ZKTeco/COM/SDK phía sau, còn app chỉ nói chuyện bằng JSON qua `stdout` + exit code. Cách này production-safe hơn vì:
- không phụ thuộc `SysWOW64 PowerShell` hay `python` trên máy cài app
- dễ bundle trong `extraResources`
- dễ debug, rollback, và ship sang máy khác

Binary này phải tách riêng khỏi `device-sync-worker.exe` vì lifecycle khác nhau:
- `device-sync` là job nền định kỳ
- `machine-config` là thao tác admin live, cần readback/audit riêng

### 5. Save phải theo flow “write -> readback -> audit”
Đây là thao tác live trên máy thật nên app không được báo success chỉ vì lệnh write trả OK. Mỗi save phải:
1. Đọc `before`
2. Ghi cấu hình mới
3. Đọc lại `after`
4. So sánh với config mong muốn
5. Ghi audit log

Nếu readback không khớp, UI phải báo lỗi/partial, không báo thành công giả.

### 5a. Helper contract phải ổn định ở mức operation
`machine-config-helper.exe` nên có CLI tối thiểu:
- `get-config`
- `save-config`
- `get-state-mode`
- `set-state-mode`
- `get-schedule`
- `set-schedule`

Mọi lệnh đều nhận:
- `--ip`
- `--port`
- `--password`

Và trả:
- JSON qua `stdout`
- non-zero exit code khi fail

`save-config` nên trả luôn `before`, `after`, `ok`, `message`, `verification` để main process không phải tự ráp nhiều lệnh con.

### 6. Remote-risk policy là app-level setting, không push xuống máy
Toggle remote-risk không phải device setting của ZKTeco. Nó là policy của app desktop cho employee punch, nên cần lưu ở app DB và render trong Admin UI như một section riêng.

Phase 1 nên map UI đơn giản:
- `ON` -> `block_high_risk`
- `OFF` -> `audit_only`

Lý do không map `OFF -> off` là để khi admin “tắt chặn”, app vẫn giữ detector và audit data phục vụ tuning/rà soát sau này.

### 7. Phase 1 chỉ support 1 máy cấu hình cố định
Hiện toàn bộ repo và tool đang bám vào máy `10.60.1.5:4370` (`8000T`). Multi-device sẽ kéo theo inventory, per-device policy, lock, concurrency, và UX phức tạp hơn. Phase 1 chốt một máy để ship nhanh và an toàn hơn.

## Risks / Trade-offs

- **[Admin auth tách riêng làm tăng surface auth]** -> Giữ scope nhỏ, chỉ username/password hash + is_active + session guard rõ ràng
- **[Save config trực tiếp ra máy là thao tác live]** -> Bắt buộc readback + audit log + UI confirm
- **[Tooling hiện tại phụ thuộc Windows/COM]** -> Giới hạn feature admin machine-config là Windows-only ở main process
- **[Session model thay đổi]** -> Dùng discriminated principal để tránh if/else rải rác và giảm regression employee flow
- **[Duplicate/orphan record có thể tái xuất hiện nếu save path sai]** -> Chuẩn hóa toàn bộ write qua SSR path, không dùng `SetShortkey` cho key `5/6`

## Migration Plan

1. Thêm bảng `app_admins` và `device_config_audit_logs`
2. Thêm bootstrap path để tạo admin đầu tiên
3. Refactor session/auth contract để support `employee | admin`
4. Thêm admin auth IPC + route
5. Thêm machine-config IPC/service + audit
6. Rollout nội bộ với 1 admin account và 1 máy hiện tại

Rollback:
- Tắt route admin và IPC admin
- Không ảnh hưởng employee flow
- Device config trên máy không tự rollback; cần action explicit nếu muốn revert mode/schedule

## Open Questions

- Admin login nên để link riêng trên login page hiện tại hay vào bằng route độc lập chỉ IT biết?
- Phase 1 có cần màn hình quản lý danh sách admin hay chỉ cần script/bootstrap để tạo admin đầu tiên?
