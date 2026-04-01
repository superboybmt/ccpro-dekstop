## Why

App desktop hiện cho phép nhân viên chấm công trực tiếp trên PC, nhưng chưa có lớp kiểm soát nào với các tình huống người dùng thao tác thông qua phần mềm điều khiển từ xa như UltraViewer, AnyDesk, TeamViewer, hoặc RustDesk. Việc chỉ dựa vào mật khẩu là chưa đủ cho một hành vi nhạy cảm như chấm công.

## What Changes

- Thêm cơ chế phát hiện `remote-risk` trên desktop trước khi cho phép chấm công
- Chỉ block thao tác chấm công khi risk đạt mức cao, không block chỉ vì remote tool đang chạy nền
- Cho phép admin bật/tắt enforcement của remote-risk guard từ Admin UI
- Ghi audit log cho các lần punch bị chặn hoặc bị đánh dấu nghi ngờ vì remote-risk
- Cập nhật UI để hiển thị trạng thái risk và lý do bị chặn gần thời điểm punch

## Capabilities

### New Capabilities
- `remote-risk-guard`: Phát hiện tín hiệu remote-control risk trên desktop, tính mức độ rủi ro, và ghi audit dữ liệu liên quan tới punch
- `remote-risk-guard`: Phát hiện tín hiệu remote-control risk trên desktop, tính mức độ rủi ro, hỗ trợ policy mode do admin cấu hình, và ghi audit dữ liệu liên quan tới punch

### Modified Capabilities
- `attendance-checkin`: Bổ sung policy chặn punch khi `remote-risk` đạt mức cao tại thời điểm thực hiện thao tác

## Impact

- Electron main process: thêm detector/service để đọc process, active connections, foreground signal, và quyết định risk
- App DB `CCPro_Desktop`: thêm audit table cho blocked/suspicious punch attempts
- Renderer: cập nhật trạng thái risk trên dashboard và thông báo lý do khi punch bị chặn
- Attendance flow: `check-in/check-out` IPC cần enforce remote-risk policy trước khi INSERT vào `CheckInOut`
