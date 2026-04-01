## Why

App hiện đã có admin login riêng, nhưng admin chưa thể quản lý tài khoản nhân viên ở mức ứng dụng. Điều này làm đội vận hành không chủ động được việc khóa/mở user trên app desktop hoặc reset mật khẩu tạm và buộc user đổi lại ngay sau khi được cấp lại quyền truy cập.

## What Changes

- Thêm trang `Admin > Quản lý người dùng` để tìm kiếm và xem danh sách user nhân viên lấy từ `WiseEye.UserInfo` kết hợp với `dbo.app_users`
- Cho phép admin bật/tắt trạng thái truy cập app desktop của từng user mà không phụ thuộc hoàn toàn vào `WiseEye.UserEnabled`
- Cho phép admin reset mật khẩu user về mật khẩu tạm và đồng thời bật lại cờ yêu cầu đổi mật khẩu ở lần đăng nhập kế tiếp
- Bổ sung app-level user state trong `dbo.app_users` để quản lý `active/inactive` riêng cho ứng dụng
- Ghi audit log cho các thao tác quản trị user như activate, deactivate, reset password
- Hiển thị trạng thái account rõ ràng trong admin UI, bao gồm trạng thái app và trạng thái WiseEye

## Capabilities

### New Capabilities
- `admin-user-management`: Cho phép admin tìm kiếm, xem, kích hoạt/vô hiệu hóa tài khoản app của nhân viên, và reset mật khẩu với yêu cầu đổi lại ở lần đăng nhập kế tiếp

### Modified Capabilities
- None

## Impact

- App DB `CCPro_Desktop`: mở rộng `dbo.app_users` và thêm bảng audit cho thao tác quản trị user
- Electron main process: thêm service/repository/IPC cho user management và enforcement trong employee login flow
- Renderer: thêm trang admin quản lý users và các action activate/inactivate/reset password
- Employee auth: login phải tôn trọng trạng thái app-level mới và tiếp tục dùng flow `is_first_login` sau reset password
