## Why

App hiện chỉ có luồng đăng nhập nhân viên dựa trên `WiseEye.UserInfo.UserFullCode` (`E01xxxxx`) và `dbo.app_users`. Cách này phù hợp cho chấm công cá nhân, nhưng không phù hợp để cấp quyền cấu hình máy chấm công thật vì quyền quản trị hệ thống không nên phụ thuộc vào mã nhân viên WiseEye.

## What Changes

- Thêm luồng đăng nhập quản trị riêng bằng tài khoản ứng dụng nội bộ, không phụ thuộc `E01xxxxx`
- Thêm màn hình admin riêng để đọc và cập nhật cấu hình máy chấm công ZKTeco thật
- Cho phép admin đổi `StateMode` và cấu hình 4 mốc auto-switch từ UI, sau đó verify readback từ máy
- Thêm mục policy trong Admin UI để admin bật/tắt enforcement của remote-risk guard cho luồng chấm công
- Lưu audit log cho các lần thay đổi cấu hình máy từ app
- Giữ nguyên employee flow hiện tại, không đổi login/chấm công của nhân viên

## Capabilities

### New Capabilities
- `admin-auth`: Xác thực admin bằng `app_admins`, session riêng, route riêng, và phân quyền truy cập chức năng cấu hình máy
- `device-machine-config`: Đọc/ghi `StateMode` và lịch auto-switch 4 state trên máy ZKTeco thật, có verify readback và audit log
- `admin-auth`: Xác thực admin bằng `app_admins`, session riêng, route riêng, và phân quyền truy cập chức năng cấu hình máy
 
### Modified Capabilities
- `device-machine-config`: Mở rộng Admin UI để quản lý policy enforcement của remote-risk guard bên cạnh cấu hình máy

## Impact

- App DB `CCPro_Desktop`: thêm `app_admins` và `device_config_audit_logs`
- Electron main process: thêm admin auth service, admin session guard, machine-config IPC/service
- Renderer: thêm admin login page và admin device-config page
- Device integration: tái sử dụng đường `StateMode` + `SSR_GetDeviceData/SSR_SetDeviceData` đã prove trên máy `8000T`
- Security: tách quyền admin khỏi employee session hiện tại
