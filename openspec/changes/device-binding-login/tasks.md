## 1. Database Schema

- [x] 1.1 Thêm cột `bound_hardware_id NVARCHAR(64) NULL` vào bảng `dbo.app_users` (migration trong `db/init.ts`)
- [x] 1.2 Seed row `device_binding_enabled` = `off` vào bảng `dbo.app_settings` (trong `db/init.ts`)

## 2. Hardware ID Module

- [x] 2.1 Tạo file `src/main/services/hardware-id.ts` — sinh Hardware ID bằng cách chạy lệnh PowerShell lấy Motherboard Serial + MAC Address, hash SHA-256, cache trong memory (singleton)
- [x] 2.2 Viết unit test `src/main/services/__tests__/hardware-id.test.ts` — kiểm tra format output (64 hex chars), cache behavior, fallback khi MB Serial trống

## 3. Auth Service — Device Binding Logic

- [x] 3.1 Sửa `auth-service.ts`: thêm tham số `hardwareId` vào phương thức `login()`, thêm logic kiểm tra 2 chiều (user→device, device→user) khi toggle ON
- [x] 3.2 Sửa `AuthRepository` interface: thêm `findUserByHardwareId(hardwareId: string)` và `updateHardwareId(userEnrollNumber: number, hardwareId: string)`
- [x] 3.3 Implement `findUserByHardwareId` và `updateHardwareId` trong `SqlAuthRepository`
- [x] 3.4 Viết unit test cho các scenario: đúng thiết bị, sai thiết bị, thiết bị đã gắn user khác, toggle OFF bypass, auto-bind lần đầu

## 4. Admin Settings — Device Binding Toggle

- [x] 4.1 Sửa `admin-settings-service.ts`: thêm `getDeviceBindingEnabled()` và `saveDeviceBindingEnabled(enabled: boolean)` sử dụng key `device_binding_enabled`
- [x] 4.2 Thêm IPC handler trong `register-handlers.ts` cho get/save device binding setting
- [x] 4.3 Thêm API type vào `src/shared/api.ts` và expose qua `preload/index.ts`
- [x] 4.4 Sửa trang Admin Settings (renderer) thêm toggle ON/OFF cho Device Binding

## 5. Admin User Management — Unbind Device

- [x] 5.1 Sửa `admin-user-management-service.ts`: thêm phương thức `unbindDevice(adminId: number, userEnrollNumber: number)` — set `bound_hardware_id = NULL` và ghi audit log
- [x] 5.2 Thêm IPC handler cho unbind device trong `register-handlers.ts`
- [x] 5.3 Thêm API type và preload expose cho unbind device
- [x] 5.4 Sửa trang Admin User Management (renderer): hiển thị trạng thái device binding của nhân viên và nút "Gỡ liên kết thiết bị" (disable khi chưa có bound_hardware_id)

## 6. Login Flow Integration

- [x] 6.1 Sửa IPC login handler trong `register-handlers.ts`: lấy Hardware ID từ module `hardware-id.ts` và truyền vào `authService.login()`
- [x] 6.2 Cập nhật error message UI trong renderer khi bị chặn bởi device binding
- [x] 6.3 Viết integration test cho full login flow với device binding ON/OFF

## 7. Verification

- [x] 7.1 Chạy toàn bộ test suite (`npm test`) đảm bảo không regression
- [x] 7.2 Test thủ công: login trên máy thật → kiểm tra Hardware ID được gắn → toggle ON → thử login trên máy khác → bị chặn → Admin unbind → login lại thành công
