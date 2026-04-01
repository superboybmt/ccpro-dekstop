## Why

Admin hiện có đăng nhập riêng nhưng chưa có đường sản phẩm để tự đổi mật khẩu của chính mình. Nếu admin quên mật khẩu thì hệ thống cũng chưa có recovery flow rõ ràng; bootstrap hiện tại chỉ giải quyết lúc chưa có admin nào, không xử lý tốt case môi trường đã có admin nhưng mất quyền truy cập.

Thiếu hai đường này làm auth admin bị thiếu một capability cơ bản và tạo rủi ro vận hành:
- admin đang đăng nhập không thể chủ động thay mật khẩu định kỳ
- admin quên mật khẩu dễ rơi vào tình trạng phải can thiệp ad-hoc ở DB
- chưa có quy ước rõ ràng giữa self-service change password và privileged password recovery

## What Changes

- Thêm flow `Admin > Tài khoản > Đổi mật khẩu` cho admin đang đăng nhập
- Bổ sung trạng thái bắt buộc đổi mật khẩu cho admin sau khi được cấp lại mật khẩu tạm
- Cho phép admin khác reset mật khẩu tạm cho một admin và buộc đổi lại ở lần đăng nhập kế tiếp
- Bổ sung emergency recovery path ngoài UI cho trường hợp không còn admin nào đăng nhập được
- Ghi audit log cho các thao tác đổi mật khẩu và reset mật khẩu admin
- Không thêm link `Quên mật khẩu?` công khai trên trang admin login trong phase 1

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `admin-auth`: mở rộng từ login/bootstrap sang self-service password change và controlled password recovery cho admin

## Impact

- App DB `CCPro_Desktop`: mở rộng `dbo.app_admins` với metadata phục vụ temporary password / forced password change, và thêm audit log cho admin credential actions
- Electron main process: thêm service/repository/IPC cho admin self-change password, admin-to-admin reset password, và emergency recovery path có kiểm soát
- Renderer: thêm trang hoặc section đổi mật khẩu trong khu admin, và force admin đổi lại mật khẩu khi đăng nhập bằng mật khẩu tạm
- Admin login/session flow: phải tôn trọng cờ `must_change_password` tương tự employee flow nhưng tách riêng cho domain admin
