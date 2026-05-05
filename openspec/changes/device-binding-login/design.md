## Context

CCPro Desktop là ứng dụng Electron dùng cho nhân viên chấm công từ xa. Hiện tại hệ thống chỉ xác thực bằng mã nhân viên + mật khẩu. Không có cơ chế nào kiểm tra danh tính thiết bị, dẫn đến việc nhân viên có thể chia sẻ password để người khác chấm công giùm trên máy tính của họ.

Hệ thống hiện có:
- `auth-service.ts`: Xử lý login với `AuthRepository` (lookup employee → verify password → return session).
- `session-store.ts`: Lưu session cục bộ bằng `electron-store` với mã hóa.
- `admin-settings-service.ts`: Quản lý cài đặt hệ thống qua bảng `app_settings` (key-value), đã có pattern `remote_risk_guard_mode`.
- `admin-user-management-service.ts`: Quản lý nhân viên (CRUD trên `app_users`).
- `machine-config-helper.py`: Script Python đã có khả năng lấy thông tin phần cứng máy (serial, MAC) nhưng phục vụ mục đích cấu hình máy chấm công.

## Goals / Non-Goals

**Goals:**
- Gắn kết 1 tài khoản nhân viên với đúng 1 thiết bị (PC/Laptop) dựa trên Hardware ID.
- Chặn đăng nhập khi tính năng Device Binding được bật (ON) và phát hiện vi phạm (sai thiết bị).
- Cung cấp Global Toggle ON/OFF trong Admin Settings để linh hoạt vận hành.
- Cung cấp nút Unbind Device trong Admin User Management để xử lý đổi máy/hỏng máy.
- Ngầm thu thập và lưu Hardware ID ngay cả khi toggle OFF (phục vụ chuẩn bị dữ liệu trước khi bật).

**Non-Goals:**
- Không hỗ trợ 1 tài khoản đăng nhập trên nhiều thiết bị cùng lúc (multi-device).
- Không xây dựng cơ chế phê duyệt đổi thiết bị (approval flow). Admin unbind trực tiếp.
- Không thay đổi luồng Admin login (chỉ áp dụng cho employee login).

## Decisions

### 1. Thuật toán sinh Hardware ID

**Quyết định**: Kết hợp **Motherboard Serial Number** + **Primary MAC Address**, hash bằng SHA-256 để tạo chuỗi `hardware_id` cố định.

**Lý do**: 
- Motherboard Serial: Không thay đổi khi cài lại Windows hoặc thay ổ cứng. Nhưng một số máy OEM có thể trả về giá trị trống.
- MAC Address: Bổ sung tính duy nhất khi Motherboard Serial bị trùng/trống. MAC có thể bị spoof nhưng kết hợp cùng MB Serial thì đủ chắc chắn cho bài toán nội bộ.
- SHA-256: Đảm bảo output có độ dài cố định, không lộ thông tin phần cứng thực.

**Thay thế đã cân nhắc**:
- Chỉ dùng MAC Address → Dễ bị spoof, thay card mạng là mất binding.
- Dùng Windows Product Key → Thay đổi khi cài lại Windows.
- UUID từ SMBIOS → Tốt nhưng không phải lúc nào cũng có trên mọi máy Windows.

**Cách lấy trên Windows (Electron Main Process)**:
```
wmic baseboard get SerialNumber
wmic nic where "NetEnabled=true" get MACAddress
```
Hoặc dùng PowerShell: `Get-CimInstance Win32_BaseBoard | Select SerialNumber` + `Get-NetAdapter | Select MacAddress`.

### 2. Vị trí sinh Hardware ID

**Quyết định**: Sinh Hardware ID trong **Main Process** (không phải Renderer hay Preload).

**Lý do**: Main Process có toàn quyền truy cập `child_process` để chạy lệnh hệ thống. Renderer không nên và không thể chạy lệnh hệ thống trực tiếp.

### 3. Thời điểm gắn kết (Binding Strategy)

**Quyết định**: **Auto-bind khi login thành công lần đầu** (first-login binding). Nếu user chưa có `bound_hardware_id`, hệ thống tự động gắn Hardware ID hiện tại.

**Lý do**: Không cần thao tác thủ công từ Admin cho từng nhân viên. Nhân viên chỉ cần đăng nhập trên máy tính của mình, hệ thống tự gắn.

### 4. Quy tắc kiểm tra khi login (Enforcement Logic)

**Quyết định**: Kiểm tra 2 chiều (Two-way binding check):
- **Check 1**: User này đã bind với device khác chưa? → Nếu có và Hardware ID hiện tại ≠ `bound_hardware_id` → Chặn.
- **Check 2**: Device này đã bind với user khác chưa? → Query `app_users` xem có user nào khác cùng `bound_hardware_id` → Nếu có → Chặn.

**Lý do**: Check 1 ngăn 1 người dùng trên nhiều máy. Check 2 ngăn nhiều người dùng trên 1 máy. Cả hai cùng lúc mới triệt để chống Buddy Punching.

### 5. Global Toggle sử dụng pattern app_settings có sẵn

**Quyết định**: Thêm key `device_binding_enabled` vào bảng `app_settings` với giá trị `on` hoặc `off`. Mặc định: `off`.

**Lý do**: Tái sử dụng pattern đã có (giống `remote_risk_guard_mode`). Không cần tạo bảng mới hay thay đổi schema lớn.

### 6. Unbind Device

**Quyết định**: Admin có thể reset `bound_hardware_id` về `NULL` cho từng nhân viên thông qua trang User Management. Ghi log vào `admin_user_audit_logs`.

**Lý do**: Đơn giản, trực tiếp, đúng với non-goal (không cần approval flow). Audit log đảm bảo truy vết được ai đã unbind cho ai.

## Risks / Trade-offs

- **[Risk] Motherboard Serial trống trên một số máy OEM** → Mitigation: Fallback dùng Volume Serial của ổ C hoặc Windows Machine GUID (`HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`). Ưu tiên: MB Serial + MAC > MachineGuid + MAC.
- **[Risk] Nhân viên thay mainboard/card mạng** → Mitigation: Admin dùng nút Unbind Device. Hardware ID sẽ tự bind lại khi nhân viên login lần tiếp theo.
- **[Risk] Toggle OFF → ON gây khóa hàng loạt** → Mitigation: Khi toggle OFF, vẫn âm thầm thu thập Hardware ID (auto-bind). Khi chuyển sang ON, hầu hết nhân viên đã có `bound_hardware_id` đúng → không bị khóa.
- **[Risk] Thời gian chạy lệnh hệ thống lấy Hardware ID** → Mitigation: Cache kết quả Hardware ID trong memory sau lần gọi đầu tiên (singleton pattern). Không cần gọi lại mỗi lần login.
