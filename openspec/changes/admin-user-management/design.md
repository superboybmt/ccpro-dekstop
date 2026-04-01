## Context

Employee login hiện lấy identity từ `WiseEye.UserInfo` và lưu password app ở `dbo.app_users`. `app_users` mới chỉ phục vụ login cá nhân và cờ `is_first_login`; chưa có app-level activation state, chưa có audit cho thao tác admin, và admin UI hiện chỉ phục vụ cấu hình máy chấm công. Vì vậy nếu cần khóa user trên app desktop hoặc reset mật khẩu tạm, đội vận hành chưa có đường sản phẩm rõ ràng để làm.

Change này chạm cả app DB, employee auth, admin IPC, và admin UI. Ngoài ra nó phải giữ nguyên nguyên tắc hiện có: `WiseEye` vẫn là nguồn employee master, còn app chỉ quản lý quyền truy cập và mật khẩu của chính ứng dụng desktop.

## Goals / Non-Goals

**Goals:**
- Cho phép admin tìm kiếm và xem danh sách nhân viên từ WiseEye kèm trạng thái app account hiện tại
- Cho phép admin bật/tắt quyền truy cập app desktop ở mức app-level
- Cho phép admin reset mật khẩu về mật khẩu tạm và buộc user đổi lại ở lần login kế tiếp
- Ghi audit log cho các thao tác activate, deactivate, reset password
- Giữ employee login flow hiện tại, chỉ bổ sung enforcement cho trạng thái app-level mới

**Non-Goals:**
- Không tạo mới employee ngoài dữ liệu sẵn có của WiseEye
- Không làm RBAC chi tiết cho nhiều role admin trong phase 1
- Không đồng bộ ngược trạng thái app-level sang WiseEye hoặc máy chấm công
- Không thêm self-service password reset cho nhân viên

## Decisions

### 1. `WiseEye.UserInfo` là master, `app_users` là app account overlay
Không tạo bảng employee riêng trong app DB. Danh sách users cho admin sẽ join từ `WiseEye.UserInfo` với `dbo.app_users`. Cách này tránh duplicate dữ liệu nhân sự, bám đúng nguồn master hiện có, và vẫn cho phép app giữ các field riêng như password hash, first-login, và activation state.

Mở rộng `dbo.app_users` với:
- `is_active_app BIT NOT NULL DEFAULT 1`
- `updated_by_admin_id INT NULL`

Khi user chưa từng có row trong `app_users`, hệ thống coi đó là account app “implicit active” cho tới khi admin thực hiện thao tác quản lý đầu tiên.

### 2. App-level disable tách khỏi `WiseEye.UserEnabled`
Employee login phải pass cả hai điều kiện:
- `WiseEye.UserEnabled = 1`
- `app_users.is_active_app = 1` nếu row app user tồn tại

Không dùng `WiseEye.UserEnabled` để thay cho app-level disable, vì đó là cờ vận hành của hệ thống chấm công gốc. App desktop cần quyền khóa/mở độc lập để phục vụ nội quy riêng mà không ảnh hưởng dữ liệu WiseEye.

### 3. Reset password tái dùng flow `is_first_login`
Reset password sẽ:
- ghi `password_hash` mới
- set `is_first_login = 1`
- cập nhật `password_changed_at`

Không tạo cờ mới cho “must change after admin reset”, vì app đã có flow ép đổi mật khẩu dựa trên `is_first_login`. Giữ một cờ duy nhất làm domain đơn giản hơn và ít regression hơn.

Phase 1 nên dùng mật khẩu tạm do admin nhập chủ động, thay vì random auto-generated. Lý do là vận hành nội bộ thường cần đọc/trao ngay cho user qua kênh hỗ trợ. System vẫn có thể enforce tối thiểu độ dài/format.

### 4. Admin UI là trang riêng trong khu admin, không nhét vào máy chấm công
Trang mới nên là `Admin > Quản lý người dùng`, tách khỏi `Admin > Cấu hình máy chấm công`. Nó dùng cùng admin session hiện có nhưng là capability khác domain.

Màn hình phase 1 gồm:
- ô tìm kiếm theo mã NV / tên
- bảng user
- cột trạng thái WiseEye
- cột trạng thái app
- action `Kích hoạt` / `Vô hiệu hóa`
- action `Reset mật khẩu`

Không làm edit inline phức tạp. Các action nên qua confirm/modal nhỏ để tránh thao tác nhầm.

### 5. Audit log riêng cho admin user actions
Thêm bảng `dbo.admin_user_audit_logs`:
- `id`
- `admin_id`
- `user_enroll_number`
- `employee_code`
- `action`
- `before_json`
- `after_json`
- `created_at`

Audit này tách khỏi `device_config_audit_logs` để đúng domain và query/report dễ hơn. Phase 1 chưa cần UI đọc audit, nhưng bảng phải có ngay để giữ traceability cho reset password và disable account.

### 6. IPC/service tách rõ 3 use case
Main process nên có service/repository riêng cho admin user management với ba operation chính:
- `listUsers(filter)`
- `setUserActiveState(userEnrollNumber, isActive)`
- `resetUserPassword(userEnrollNumber, temporaryPassword)`

Không reuse trực tiếp `AuthService` cho action admin. `AuthService` giữ vai trò employee-facing login/change-password; admin action nên đi qua service riêng để business rules và audit rõ ràng hơn.

## Risks / Trade-offs

- `[Row app_users chưa tồn tại cho nhiều employee]` → Dùng overlay semantics: nếu chưa có row thì vẫn list được từ WiseEye, và admin action đầu tiên sẽ upsert row app user
- `[Admin reset password có thể cấp mật khẩu yếu]` → Enforce rule tối thiểu về độ dài và xác nhận rõ đây là mật khẩu tạm
- `[Disable app-level có thể gây nhầm với WiseEye disabled]` → UI phải hiển thị song song hai trạng thái và text giải thích rõ
- `[Join cross-database cho danh sách users có thể nặng]` → Phase 1 dùng filter + phân trang đơn giản, chỉ lấy các cột cần thiết

## Migration Plan

1. Mở rộng `dbo.app_users` với app-level activation metadata
2. Thêm `dbo.admin_user_audit_logs`
3. Thêm repository/service/IPC cho admin user management
4. Cập nhật employee auth để tôn trọng `is_active_app`
5. Thêm admin UI page và route cho quản lý users
6. Rollout nội bộ với admin account hiện có

Rollback:
- tắt route/IPCs admin user management
- bỏ enforcement `is_active_app` trong employee login
- dữ liệu audit và cột mới có thể giữ nguyên, không cần rollback vật lý ngay

## Open Questions

- Phase 1 có cần phân trang thật sự ngay từ đầu hay chỉ search + danh sách giới hạn?
- Mật khẩu tạm nên để admin tự nhập hay có thêm nút generate nhanh ở UI?
