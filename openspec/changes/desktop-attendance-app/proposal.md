## Why

Hiện tại nhân viên PNJ chi nhánh chỉ có thể chấm công qua máy vân tay ZKTeco (10.60.1.5). Khi máy vân tay bị lỗi, hết bộ nhớ, hoặc nhân viên quên bấm — không có phương án dự phòng. Cần một Desktop App cho phép nhân viên chấm công trực tiếp trên PC (Win/Mac), ghi thẳng vào SQL Server WiseEye DB, đảm bảo dữ liệu đồng bộ với hệ thống hiện có.

## What Changes

- **Tạo Desktop App (Electron)** cho nhân viên chấm công bằng mã NV + mật khẩu
- **Kết nối trực tiếp SQL Server** WiseEye (10.60.1.4) - INSERT vào bảng `CheckInOut`, READ từ `UserInfo`, `Shifts`
- **Tạo database riêng `CCPro_Desktop`** trên cùng SQL Server - lưu auth (password hash), settings, audit logs
- **Luồng xác thực**: Mã NV là username, default password = mã NV, bắt buộc đổi password lần đầu đăng nhập
- **5 màn hình** theo mockup Stitch: Login, Dashboard (real-time clock + check-in/out), History, Notifications, Settings
- **Design system "Luminous Editor"**: Glassmorphism, Manrope/Inter fonts, `#007AFF` primary, no-border cards
- **Bổ sung capability `device-sync`** để app đồng bộ log từ máy chấm công ZKTeco `10.60.1.5` vào SQL Server `10.60.1.4`
- **Chạy đồng bộ nền + manual retry**: app tự poll định kỳ khi chạy/tray, đồng thời cho phép người dùng bấm "Đồng bộ lại" khi cần
- **Lưu trạng thái đồng bộ trong DB app `CCPro`**: cursor, thời điểm sync gần nhất, số bản ghi import, lỗi gần nhất

## Capabilities

### New Capabilities
- `employee-auth`: Xác thực nhân viên bằng mã NV + password, default password flow, bắt buộc đổi password lần đầu, bcrypt hashing
- `attendance-checkin`: Check-in/Check-out trực tiếp vào WiseEye `CheckInOut` table, real-time clock, shift progress tracking
- `attendance-history`: Xem lịch sử chấm công, thống kê (on-time rate, overtime, absences), lọc theo ngày/tháng
- `notifications`: Thông báo chấm công (trễ, thiếu, nhắc nhở), notification center
- `account-settings`: Quản lý tài khoản cá nhân, đổi mật khẩu, cài đặt app
- `device-sync`: Đồng bộ attendance log từ máy ZKTeco 8000T (`10.60.1.5:4370`) vào `WiseEye.dbo.CheckInOut` trên SQL Server

### Modified Capabilities
_(Không có — đây là project mới)_

## Impact

- **SQL Server 10.60.1.4**: Tạo DB mới `CCPro_Desktop`, INSERT vào `WiseEye.dbo.CheckInOut`
- **Dependencies**: Electron, React 19, Vite, mssql (tedious), bcrypt, electron-updater
- **Network**: App phải trong cùng LAN với SQL Server (10.60.x.x)
- **Hệ thống WiseEye**: Dữ liệu desktop check-in xuất hiện trong WiseEye report với `Source='PC'`
- **Máy chấm công vật lý**: App cần kết nối được tới ZKTeco 8000T tại `10.60.1.5:4370`
- **Sync worker**: Cần thêm worker đọc log từ máy, map user, chống ghi trùng, và ghi trạng thái sync vào DB app
