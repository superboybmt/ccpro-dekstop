## Why

Hiện tại luồng chấm công desktop phụ thuộc trực tiếp vào SQL Server nội bộ. Khi máy người dùng ra khỏi mạng LAN hoặc không kết nối được tới SQL Server, Dashboard có thể hiển thị lỗi tải dữ liệu, nhưng nút chấm công chưa được guard riêng theo trạng thái kết nối. Điều này tạo false affordance: UI vẫn trông như có thể chấm công, trong khi thao tác thực tế sẽ fail ở backend/SQL.

Với một hành vi nhạy cảm như chấm công, trải nghiệm này không đủ rõ ràng cho người dùng vận hành. Cần chốt hành vi sản phẩm nhất quán hơn: nếu app không còn khả năng ghi dữ liệu vào SQL Server nội bộ, UI phải chặn thao tác ngay từ trước khi user bấm.

## What Changes

- Bổ sung guard cho Dashboard để khóa nút chấm công khi app không kết nối được tới SQL Server nội bộ
- Hiển thị thông báo rõ ràng rằng chấm công chỉ khả dụng khi máy đang ở trong mạng nội bộ / có kết nối tới SQL Server
- Phân biệt rõ hai lớp block:
  - block do `remote-risk`
  - block do mất kết nối SQL/LAN
- Giữ backend reject an toàn nếu request vẫn lọt xuống khi connection mất giữa chừng

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `attendance-checkin`: thêm availability guard cho trạng thái mất kết nối SQL/LAN

## Impact

- Renderer Dashboard: cần có trạng thái connection availability đủ gần thời gian thực để disable punch action
- Main process / preload API: có thể cần expose signal trạng thái SQL khả dụng cho Dashboard, thay vì chỉ dùng message lỗi sau khi request fail
- Spec attendance-checkin: cần capture rõ hành vi block trên UI khi mất khả năng ghi vào hệ thống nội bộ
