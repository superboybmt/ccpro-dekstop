## 1. Python Helper Script

- [x] 1.1 Add `sync-time` command parsing in `machine-config-helper.py`
- [x] 1.2 Implement internal `set_time` logic with `pyzk` and handle standard output responses
- [x] 1.3 Compile the helper to `machine-config-helper.exe` using the existing build script

## 2. Backend Node.js Service Integration

- [x] 2.1 Update `MachineConfigService` interface and types in `@shared/api` to expose `syncTime` function
- [x] 2.2 Implement `syncTime` in `src/main/services/machine-config-service.ts` invoking the helper
- [x] 2.3 Add audit logging using `AuditLogService.log` upon successful synchronization
- [x] 2.4 Register the IPC handler in `main.ts` or appropriate router

## 3. Frontend Admin UI Implementation

- [x] 3.1 Update `adminSettingsBridge` types if necessary, or window.ccpro types for `syncTime`
- [x] 3.2 Add a new "Hệ thống" (System Management) Card in `admin-device-config-page.tsx`
- [x] 3.3 Add the "Đồng bộ Giờ máy chấm công" button with `Clock` icon and loading states
- [x] 3.4 Display success or error toasts based on the mutation result
