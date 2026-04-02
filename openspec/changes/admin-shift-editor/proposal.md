## Why

Admin cần chỉnh giờ ca làm việc (`Onduty`, `Offduty`, `OnLunch`, `OffLunch`) trực tiếp từ CCPro Desktop mà không cần mở phần mềm WiseEye trên server. Hiện tại CCPro chỉ đọc dữ liệu shift từ WiseEye DB, chưa có khả năng ghi lại.

Ngoài ra, các input ngày/giờ trong renderer đang rải rác, phụ thuộc native picker mặc định, chưa có shared component và chưa có chuẩn hiển thị thống nhất cho locale Việt Nam.

## What Changes

- Thêm bảng danh sách Shift với inline time editor vào tab `Hệ thống` trong Admin Device Config page
- Chuẩn hóa temporal inputs trong renderer theo một shared component set gồm `DatePicker`, `TimePicker`, `DateTimePicker`, `MonthPicker`
- Migrate bộ lọc thời gian của trang `Lịch sử chấm công` sang shared temporal components
- Migrate `Lịch Auto-Switch` ở tab `Máy chấm công` khỏi native time input sang shared `TimePicker`
- Thu gọn card `Đồng bộ Giờ` hiện tại, bỏ helper text dài và giữ lại button + toast message
- Tạo backend service `AdminShiftService` để READ/UPDATE `dbo.Shifts` trên WiseEye SQL Server
- Tạo audit trail table `shift_audit_logs` trên App DB để ghi lại mọi thay đổi before/after
- Mở rộng IPC layer + preload bridge với namespace `adminShifts`
- 4 field editable: `Onduty`, `Offduty`, `OnLunch`, `OffLunch` (`OnLunch`/`OffLunch` nullable cho ca không nghỉ trưa)
- Chỉ UPDATE giờ, không thêm/xóa Shift

## Capabilities

### New Capabilities

- `shift-management`: Admin có thể xem danh sách và chỉnh giờ vào/ra/nghỉ trưa của các ca làm việc trên WiseEye DB, với audit trail đầy đủ

### Modified Capabilities

_(none)_

## Impact

- **WiseEye DB (`dbo.Shifts`)**: thêm quyền WRITE (UPDATE)
- **App DB**: thêm table `shift_audit_logs`
- **Admin UI**: mở rộng tab `Hệ thống` trong `admin-device-config-page.tsx`
- **Shared renderer UI**: thêm temporal input primitives dùng chung cho các flow month/date/time/datetime
- **IPC/Preload**: thêm 2 handler mới (`admin-shifts:list`, `admin-shifts:update`)
- **Shared types**: thêm interfaces cho shift management vào `api.ts`
