## Context

App desktop được thiết kế chạy trong mạng LAN nội bộ và ghi trực tiếp vào `WiseEye.dbo.CheckInOut` trên SQL Server `10.60.1.4`. Đây là một ràng buộc hạ tầng cứng, không phải optional dependency. Tuy nhiên UI hiện tại mới chặn chấm công theo `remote-risk`; còn case mất SQL/LAN chủ yếu xuất hiện như error message khi load dashboard hoặc khi gọi thao tác xuống backend.

Điều đó dẫn tới một trạng thái UX mơ hồ:

```text
User ngoài LAN
  -> có thể vẫn nhìn thấy nút chấm công
  -> bấm chấm công
  -> request fail ở backend/SQL
```

Với tác vụ chấm công, đây là một affordance sai. Người dùng nên biết ngay rằng hệ thống hiện không thể ghi nhận punch.

## Goals / Non-Goals

**Goals:**
- Chặn thao tác chấm công ngay trên UI khi app không kết nối được tới SQL Server nội bộ
- Hiển thị message rõ ràng, hướng người dùng quay lại mạng LAN / thử lại sau
- Giữ hành vi backend an toàn nếu connection mất sau khi UI đã cho phép bấm
- Không làm người dùng nhầm giữa block do bảo mật và block do hạ tầng

**Non-Goals:**
- Không hỗ trợ offline punch queue trong phase này
- Không thêm retry background phức tạp cho thao tác chấm công
- Không thay đổi business rule `remote-risk`

## Decisions

### 1. Mất SQL/LAN phải block ngay ở UI
Khi app không xác nhận được kết nối SQL Server, Dashboard phải disable nút `Chấm công vào` / `Chấm công ra`. Đây là quyết định sản phẩm, không chỉ là cải thiện kỹ thuật.

Lý do:
- thao tác punch không thể hoàn tất nếu không ghi được vào DB nguồn
- giữ nút enabled làm user tưởng hệ thống vẫn hoạt động
- block sớm giảm bớt support case “em bấm rồi nhưng không biết có ghi nhận chưa”

### 2. Message phải nói theo ngôn ngữ người dùng, không nói theo stack kỹ thuật
UI nên nói rõ theo ngữ cảnh vận hành:
- `Không thể chấm công khi ứng dụng không kết nối được mạng nội bộ / SQL Server. Vui lòng kết nối lại mạng LAN và thử lại.`

Không nên để user chỉ thấy error kỹ thuật kiểu `Failed to connect 10.60.1.4:1433`.

### 3. Phân biệt block do network với block do remote-risk
Dashboard hiện đã có block theo `remote-risk`. Availability guard mới phải độc lập và ưu tiên hiển thị rõ reason hiện tại.

Gợi ý mental model:

```text
Can punch =
  session valid
  AND SQL available
  AND remote-risk not blocking
  AND not currently submitting
```

### 4. Backend vẫn là lớp an toàn cuối cùng
Dù UI đã block, backend vẫn phải giữ behavior fail-safe nếu connection rớt ngay trước lúc INSERT. UI guard chỉ để tránh false affordance, không thay thế validation/runtime failure handling ở backend.

## Risks / Trade-offs

- `[SQL check có thể flicker]` -> nên debounce / reuse trạng thái connection gần nhất thay vì ping quá dày
- `[Dashboard có thêm state]` -> chấp nhận vì rule sản phẩm rõ ràng hơn
- `[User ở VPN hoặc mạng bất thường]` -> không suy luận theo subnet; nguồn sự thật vẫn là khả năng kết nối SQL thực tế

## Migration Plan

1. Bổ sung source trạng thái `SQL available / unavailable` cho renderer
2. Gắn guard vào Dashboard button state
3. Hiển thị message availability riêng cho case mất kết nối nội bộ
4. Thêm test UI cho case connection unavailable nhưng remote-risk không block
