## ADDED Requirements

### Requirement: Hardware ID Generation
Hệ thống SHALL sinh một chuỗi Hardware ID duy nhất cho mỗi thiết bị dựa trên thông tin phần cứng (Motherboard Serial + MAC Address), hash bằng SHA-256. Hardware ID MUST không thay đổi giữa các lần khởi động ứng dụng trên cùng một máy tính. Hardware ID MUST được cache trong memory sau lần sinh đầu tiên.

#### Scenario: Sinh Hardware ID thành công
- **WHEN** ứng dụng khởi động trên một máy tính có Motherboard Serial và MAC Address hợp lệ
- **THEN** hệ thống trả về một chuỗi SHA-256 hex (64 ký tự) cố định cho máy tính đó

#### Scenario: Motherboard Serial trống
- **WHEN** máy tính không trả về Motherboard Serial (một số máy OEM)
- **THEN** hệ thống fallback sử dụng Windows MachineGuid thay thế Motherboard Serial và vẫn sinh được Hardware ID hợp lệ

#### Scenario: Cache Hardware ID
- **WHEN** Hardware ID đã được sinh một lần trong phiên chạy hiện tại
- **THEN** các lần gọi tiếp theo MUST trả về giá trị đã cache mà không chạy lại lệnh hệ thống

---

### Requirement: Device Binding Toggle
Admin SHALL có khả năng bật/tắt (ON/OFF) tính năng Device Binding thông qua trang Admin Settings. Giá trị mặc định MUST là OFF. Khi OFF, hệ thống vẫn thu thập và lưu Hardware ID nhưng không chặn đăng nhập.

#### Scenario: Bật Device Binding
- **WHEN** Admin chuyển toggle sang ON và lưu cấu hình
- **THEN** hệ thống lưu `device_binding_enabled = on` vào `app_settings` và trả về thông báo thành công

#### Scenario: Tắt Device Binding
- **WHEN** Admin chuyển toggle sang OFF và lưu cấu hình
- **THEN** hệ thống lưu `device_binding_enabled = off` vào `app_settings` và mọi kiểm tra device binding bị bypass khi nhân viên đăng nhập

#### Scenario: Giá trị mặc định
- **WHEN** chưa có row `device_binding_enabled` trong `app_settings`
- **THEN** hệ thống xử lý như OFF (không chặn)

---

### Requirement: Auto-bind on First Login
Khi nhân viên đăng nhập thành công và chưa có `bound_hardware_id`, hệ thống SHALL tự động gắn Hardware ID hiện tại vào tài khoản của nhân viên đó. Điều này áp dụng bất kể toggle ON hay OFF.

#### Scenario: Nhân viên chưa có bound_hardware_id
- **WHEN** nhân viên đăng nhập thành công và cột `bound_hardware_id` là NULL
- **THEN** hệ thống tự động cập nhật `bound_hardware_id` bằng Hardware ID hiện tại

#### Scenario: Nhân viên đã có bound_hardware_id và toggle OFF
- **WHEN** nhân viên đăng nhập thành công, đã có `bound_hardware_id`, và toggle là OFF
- **THEN** hệ thống cho phép đăng nhập bình thường mà không thay đổi `bound_hardware_id`

---

### Requirement: Login Device Enforcement
Khi toggle ON, hệ thống SHALL kiểm tra 2 chiều (Two-way binding) trước khi cho phép đăng nhập:
1. Tài khoản nhân viên đã bị gắn với thiết bị khác hay chưa.
2. Thiết bị hiện tại đã bị gắn với tài khoản khác hay chưa.

#### Scenario: Đăng nhập từ đúng thiết bị đã gắn kết
- **WHEN** nhân viên đăng nhập, toggle ON, và Hardware ID hiện tại trùng với `bound_hardware_id` của nhân viên
- **THEN** hệ thống cho phép đăng nhập bình thường

#### Scenario: Tài khoản đã gắn với thiết bị khác
- **WHEN** nhân viên đăng nhập, toggle ON, `bound_hardware_id` của nhân viên không NULL và khác với Hardware ID hiện tại
- **THEN** hệ thống chặn đăng nhập với thông báo: "Tài khoản của bạn đã được gắn với thiết bị khác. Vui lòng liên hệ quản trị viên."

#### Scenario: Thiết bị đã gắn với tài khoản khác
- **WHEN** nhân viên đăng nhập, toggle ON, nhân viên chưa có `bound_hardware_id`, nhưng Hardware ID hiện tại đã tồn tại trong `bound_hardware_id` của nhân viên khác
- **THEN** hệ thống chặn đăng nhập với thông báo: "Thiết bị này đã được đăng ký cho tài khoản khác. Vui lòng liên hệ quản trị viên."

#### Scenario: Toggle OFF bypass kiểm tra
- **WHEN** nhân viên đăng nhập và toggle là OFF
- **THEN** hệ thống bỏ qua toàn bộ kiểm tra device binding, cho phép đăng nhập bình thường

---

### Requirement: Unbind Device
Admin SHALL có khả năng gỡ liên kết thiết bị (reset `bound_hardware_id` về NULL) cho từng nhân viên thông qua trang Admin User Management. Mỗi thao tác unbind MUST được ghi log vào `admin_user_audit_logs`.

#### Scenario: Admin gỡ liên kết thiết bị thành công
- **WHEN** Admin nhấn nút "Gỡ liên kết thiết bị" cho một nhân viên có `bound_hardware_id` không NULL
- **THEN** hệ thống đặt `bound_hardware_id` về NULL, ghi audit log với action `unbind-device`, và trả về thông báo thành công

#### Scenario: Nhân viên đăng nhập sau khi bị unbind
- **WHEN** nhân viên đã bị unbind đăng nhập lại trên một máy tính bất kỳ
- **THEN** hệ thống auto-bind Hardware ID mới cho nhân viên đó (theo requirement Auto-bind on First Login)

#### Scenario: Nhân viên chưa có bound_hardware_id
- **WHEN** Admin nhấn nút "Gỡ liên kết thiết bị" cho nhân viên có `bound_hardware_id` là NULL
- **THEN** nút bị disable hoặc ẩn, không cho phép thao tác
