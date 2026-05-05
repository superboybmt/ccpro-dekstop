## Why

Nhân viên có thể chia sẻ mật khẩu cho đồng nghiệp và chấm công giùm (Buddy Punching) trên cùng một PC/Laptop. Hiện hệ thống chỉ xác thực bằng mã nhân viên + mật khẩu mà không kiểm tra danh tính thiết bị. Vì CCPro là ứng dụng Desktop (Electron), chúng ta có thể lấy mã định danh phần cứng (Hardware ID) để gắn cố định mỗi tài khoản với đúng một thiết bị duy nhất.

## What Changes

- Sinh và lưu trữ **Hardware ID** duy nhất cho mỗi máy tính (dựa trên Motherboard Serial + MAC Address) ngay trong Electron Main Process.
- Thêm cột `bound_hardware_id` vào bảng `app_users` để lưu thiết bị đã được gắn kết với tài khoản nhân viên.
- Sửa đổi luồng đăng nhập (Login Flow): khi tính năng được bật, server sẽ kiểm tra Hardware ID và chặn đăng nhập nếu tài khoản đã bị gắn với thiết bị khác hoặc thiết bị đã bị gắn với tài khoản khác.
- Thêm **Global Toggle** (ON/OFF) trong Admin Settings để bật/tắt tính năng Device Binding. Mặc định: **OFF** (bypass, không chặn).
- Thêm nút **"Gỡ liên kết thiết bị" (Unbind Device)** trong trang Quản lý Nhân viên (Admin User Management) để Admin có thể reset Hardware ID khi nhân viên đổi máy hoặc hỏng máy.

## Capabilities

### New Capabilities
- `device-binding`: Sinh Hardware ID trên client, gắn kết 1 tài khoản với 1 thiết bị, chặn đăng nhập khi vi phạm, cung cấp Admin Toggle ON/OFF và chức năng Unbind Device.

### Modified Capabilities
_(Không có capability hiện tại nào bị thay đổi ở mức spec. Luồng login chỉ thêm một bước kiểm tra mới, không thay đổi hành vi cũ.)_

## Impact

- **Database**: Thêm cột `bound_hardware_id` vào `dbo.app_users`, thêm row `device_binding_enabled` vào `dbo.app_settings`.
- **Main Process**: Thêm module sinh Hardware ID (`hardware-id.ts`), sửa `auth-service.ts` để kiểm tra device binding khi login.
- **IPC**: Thêm channel gửi Hardware ID từ renderer/preload sang main, hoặc xử lý trực tiếp trong main process.
- **Admin Panel**: Sửa trang Settings để thêm toggle Device Binding, sửa trang User Management để thêm nút Unbind Device.
- **Preload**: Có thể cần expose thêm API lấy Hardware ID nếu renderer cần hiển thị thông tin thiết bị.
