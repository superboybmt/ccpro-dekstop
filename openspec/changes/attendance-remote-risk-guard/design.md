## Context

Luồng chấm công hiện tại cho phép nhân viên đã đăng nhập click nút check-in/check-out để ghi trực tiếp vào `WiseEye.dbo.CheckInOut`. Điều này phù hợp với mục tiêu dự phòng cho máy chấm công vật lý, nhưng cũng tạo ra lỗ hổng vận hành: nếu user mở app qua công cụ điều khiển từ xa, app hiện không có lớp kiểm soát nào để phát hiện hay chặn thao tác này.

Điểm quan trọng là remote-control detection trên Windows không thể đạt độ chắc chắn 100% cho các tool như UltraViewer/AnyDesk, vì chúng thường thao tác trong cùng interactive session. Vì vậy, thiết kế không nên block chỉ vì process tồn tại. Thay vào đó, cần một policy `high-confidence block` dựa trên nhiều tín hiệu đồng thời.

## Goals / Non-Goals

**Goals:**
- Phát hiện remote-risk tại thời điểm employee punch
- Chỉ block khi tín hiệu đủ mạnh để giảm false positive
- Enforce policy ở main process để tránh bypass renderer
- Ghi audit log đầy đủ cho blocked/suspicious attempts
- Hiển thị trạng thái phù hợp trên UI để user hiểu vì sao bị chặn

**Non-Goals:**
- Không cố chứng minh pháp lý rằng user chắc chắn đang bị remote
- Không chặn chỉ vì remote tool tồn tại trong startup/background
- Không triển khai anti-cheat hoặc kernel-level monitoring
- Không cover mọi remote tool trên thị trường trong phase 1

## Decisions

### 1. Dùng `high-confidence block`, không dùng `process-only block`
Có ba hướng:
- `process-only`: chỉ cần thấy `UltraViewer.exe` là block
- `medium-confidence`: process + một tín hiệu active
- `high-confidence`: process + active signal + gần thời điểm punch

Chọn `high-confidence` vì đây là điểm cân bằng tốt nhất giữa bảo mật và trải nghiệm. Process-only sẽ block oan nhiều vì các tool remote có thể auto-start cùng Windows.

### 2. Tách detector thành service riêng trong main process
Detector nên là service độc lập, ví dụ `RemoteRiskService`, có trách nhiệm:
- đọc denylist process
- kiểm tra connection/network signal
- đọc foreground/recent foreground signal
- hợp nhất thành `riskLevel`

Attendance service chỉ consume kết quả policy, không trực tiếp tự scan process. Cách này giữ boundary rõ: detector lo `nhìn máy`, attendance lo `quyết định punch`.

### 3. Risk classification chia 3 mức `low / medium / high`
Phase 1 nên rõ ràng:
- `low`: chỉ thấy process -> không block
- `medium`: process + active network hoặc recent window -> cho punch, nhưng audit suspicious
- `high`: process + active network/window signal + xảy ra gần thời điểm punch -> block

Điều này cho phép rollout an toàn hơn: app vừa có dữ liệu audit thực tế, vừa không gây quá nhiều false positive ngay ngày đầu.

### 4. Enforcement policy là app setting có thể cấu hình bởi admin
Risk classification và enforcement không nên bị đồng nhất. Detector luôn nên chạy khi feature được rollout, nhưng enforcement có thể thay đổi theo policy:
- `audit_only`: detect + audit, không block
- `block_high_risk`: detect + block khi risk = high

Phase 1 nên render ra Admin UI dưới dạng một toggle đơn giản:
- `ON` = `block_high_risk`
- `OFF` = `audit_only`

Điều này phù hợp vận hành hơn việc “tắt hẳn detect”, vì admin vẫn thu được audit log khi tạm thời không muốn chặn cứng user.

### 5. Main process là nơi chặn thật, renderer chỉ hỗ trợ UX
Renderer có thể disable nút và show cảnh báo, nhưng enforcement bắt buộc phải nằm ở IPC/main process ngay trước khi INSERT `CheckInOut`. Nếu không, bất kỳ bypass renderer nào cũng làm policy vô nghĩa.

### 6. Audit log riêng cho remote-risk punch attempts
Không nên nhét vào `app_notifications` hay reuse audit admin config. Cần bảng riêng để lưu:
- user
- action check-in/check-out
- detected processes
- connection/window signal
- risk level
- blocked hay allowed
- timestamp

Sau này có thể dùng chính data này để tuning policy.

### 7. Phase 1 denylist cố định
Danh sách phase 1:
- UltraViewer
- AnyDesk
- TeamViewer
- RustDesk

Chưa cần UI quản lý denylist ở phase đầu. Config cố định trong main process hoặc config file là đủ để ship sớm.

## Risks / Trade-offs

- **[False negative]** -> Chấp nhận vì remote detection với shared local session không thể hoàn hảo; audit log giúp nhìn lại thực tế
- **[False positive]** -> Giảm bằng policy high-confidence, không block process-only
- **[Windows-only signals]** -> Feature chỉ khả thi tốt ở main process Windows; cần degrade gracefully nếu thiếu signal
- **[Policy khó tuning]** -> Lưu audit chi tiết để quan sát trước khi mở rộng denylist/rule
- **[Bypass nếu chỉ check UI]** -> Chặn ở main process ngay trước insert
- **[Admin hiểu nhầm toggle là tắt toàn bộ detect]** -> UI copy phải nói rõ `OFF` chỉ tắt block, app vẫn audit remote-risk

## Migration Plan

1. Thêm schema audit log cho remote-risk punch attempts
2. Thêm detector/service trong main process
3. Tích hợp policy vào `attendance:check-in` và `attendance:check-out`
4. Cập nhật Dashboard để phản ánh risk state và lý do bị chặn
5. Rollout nội bộ và theo dõi audit log để tuning rule

Rollback:
- tắt enforcement trong attendance IPC
- giữ detector/audit nếu muốn chỉ chạy monitor mode

## Open Questions

- Cửa sổ thời gian `near punch` nên là 30 giây, 60 giây, hay 120 giây?
- Phase 1 có nên block cả `medium` cho admin actions nhưng chỉ block `high` cho employee punch không?
