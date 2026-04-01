## Context

Admin auth hiện đã tách khỏi employee auth với `dbo.app_admins`, session riêng, và route admin riêng. Tuy nhiên contract hiện tại mới dừng ở `login`, `logout`, và `bootstrap`. Hệ thống chưa có:
- self-service change password cho admin đang đăng nhập
- forced password change sau admin password reset
- recovery path rõ ràng khi admin quên mật khẩu

Vì vậy domain admin auth đang thiếu một vòng đời credential hoàn chỉnh. Đây là khoảng trống nhỏ về scope nhưng lại quan trọng về vận hành.

## Goals / Non-Goals

**Goals:**
- Cho phép admin đang đăng nhập tự đổi mật khẩu của chính mình
- Cho phép admin khác reset mật khẩu tạm cho admin bị mất quyền truy cập
- Buộc admin đổi lại mật khẩu ở lần đăng nhập tiếp theo khi dùng mật khẩu tạm
- Có emergency recovery path tối thiểu cho môi trường chỉ còn 1 admin và người đó quên mật khẩu
- Giữ flow ngắn gọn, không thêm dependency hay external identity provider

**Non-Goals:**
- Không làm public `forgot password` qua email / OTP / SMS
- Không làm RBAC chi tiết cho nhiều role admin trong phase 1
- Không mở UI quản lý danh sách admin đầy đủ nếu chưa cần
- Không cho phép bypass current password trong self-service flow

## Decisions

### 1. Tách rõ `change password` và `recovery`
`Đổi mật khẩu` và `quên mật khẩu` là hai use case khác nhau:
- self-service change password: chỉ dành cho admin đã đăng nhập và phải nhập đúng mật khẩu hiện tại
- recovery: chỉ đi qua privileged path, không phải self-service

Điều này giữ bề mặt tấn công nhỏ và tránh biến trang login thành một điểm recovery yếu.

### 2. Admin tự đổi mật khẩu trong session hiện tại
Admin đang đăng nhập có thể vào `Admin > Tài khoản > Đổi mật khẩu` và submit:
- `currentPassword`
- `newPassword`
- `confirmPassword`

Service phải:
- verify mật khẩu hiện tại
- validate mật khẩu mới
- ghi `password_hash` mới
- clear cờ `must_change_password`
- cập nhật `password_changed_at`
- ghi audit log action `self-change-password`

Không cần gửi email, OTP, hay step xác minh phụ trong phase 1 vì app là desktop nội bộ và đã có session admin hợp lệ.

### 3. Dùng một cờ bắt buộc đổi mật khẩu cho admin
`dbo.app_admins` nên có cờ rõ ràng kiểu `must_change_password BIT NOT NULL DEFAULT 0`.

Khi admin được reset mật khẩu tạm:
- hệ thống ghi password hash mới
- set `must_change_password = 1`
- vẫn cho phép đăng nhập
- nhưng sau login phải redirect thẳng đến màn đổi mật khẩu và chặn các admin action khác cho tới khi đổi xong

Cách này đối xứng với employee flow hiện có, nhưng không reuse trực tiếp state employee vì domain tách riêng.

### 4. Recovery phase 1 đi qua admin khác hoặc local maintenance path
Không thêm link `Quên mật khẩu?` ở trang login admin nếu chưa có một kênh xác minh danh tính độc lập.

Phase 1 chốt 2 đường recovery:
- nếu còn admin khác hoạt động: admin đó reset mật khẩu tạm cho tài khoản bị quên mật khẩu
- nếu không còn admin nào đăng nhập được: dùng local maintenance path ngoài renderer, yêu cầu quyền truy cập trực tiếp vào máy chạy app

Maintenance path này nên là command/script nội bộ có kiểm soát, không phải IPC public. Nó tồn tại để xử lý case break-glass, không phải flow thường ngày.

### 5. Bootstrap không kiêm luôn recovery
Bootstrap hiện tại dành cho case `countAdmins = 0`. Không nên mở rộng bootstrap thành công cụ reset khi admin đã tồn tại, vì sẽ làm semantics mơ hồ và dễ mở nhầm một đường tạo quyền ngoài ý muốn.

Recovery nên là operation riêng, tên riêng, guard riêng, audit riêng.

### 6. Audit log riêng cho thao tác credential admin
Thêm bảng `dbo.admin_auth_audit_logs`:
- `id`
- `actor_admin_id NULL`
- `target_admin_id`
- `action`
- `status`
- `metadata_json NULL`
- `created_at`

Các action tối thiểu:
- `self-change-password`
- `admin-reset-password`
- `emergency-reset-password`

Phase 1 chưa cần UI đọc audit, nhưng phải lưu vết ngay từ đầu vì đây là thao tác nhạy cảm.

## Risks / Trade-offs

- `[Thêm recovery path làm tăng auth surface]` -> chỉ cho phép qua admin khác hoặc local maintenance path, không public self-service reset
- `[Single-admin environment vẫn có điểm nghẽn vận hành]` -> chấp nhận trong phase 1 nhưng phải có break-glass path rõ ràng
- `[Force change sau reset làm phức tạp admin session]` -> thêm cờ riêng cho admin để logic minh bạch, tránh if/else lẫn với employee auth
- `[Quản lý admin bằng UI có thể kéo scope to]` -> phase 1 chỉ cần đủ để reset credential, không mở rộng sang admin management đầy đủ nếu chưa có nhu cầu

## Migration Plan

1. Mở rộng `dbo.app_admins` với cờ `must_change_password` và timestamp đổi mật khẩu nếu cần
2. Thêm `dbo.admin_auth_audit_logs`
3. Thêm repository/service cho self-change password và admin reset password
4. Cập nhật admin session contract để phản ánh `mustChangePassword`
5. Thêm admin UI cho đổi mật khẩu và force-change redirect
6. Bổ sung local maintenance recovery path cho single-admin lockout

Rollback:
- tắt UI/IPC đổi mật khẩu admin mới
- giữ nguyên dữ liệu audit và cột mới
- login admin cũ vẫn hoạt động, chỉ mất capability mới
