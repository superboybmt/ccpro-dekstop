## Context

CCPro Desktop app hiện kết nối WiseEye SQL Server để đọc dữ liệu ca (`dbo.Shifts`) qua join chain `UserInfo -> Schedule -> WSchedules -> Shifts`. Dữ liệu shift được dùng ở dashboard, notifications và history. Flow ban đầu chỉ READ; change này thêm khả năng WRITE cho admin.

Admin UI hiện có trang `admin-device-config-page.tsx` với 3 tab: `Máy chấm công`, `Hệ thống`, `Bảo mật`. Tab `Hệ thống` đang khá trống nên phù hợp để chứa shift editor.

Song song đó, renderer hiện chưa có hệ temporal input dùng chung. Các màn đang phụ thuộc native `input[type="date"]` / `input[type="time"]` hoặc style ad-hoc, khiến UI thiếu đồng bộ và hành vi parse/format dễ lệch giữa các màn.

## Goals / Non-Goals

**Goals:**

- Admin chỉnh được 4 mốc giờ (`Onduty`, `Offduty`, `OnLunch`, `OffLunch`) của mỗi Shift trực tiếp từ Admin UI
- Ghi audit trail đầy đủ: ai đổi, before/after, thời gian
- Inline editing, không cần modal cho shift editor
- Chuẩn hóa temporal inputs theo shared component set cho renderer
- Chuẩn hiển thị toàn app theo locale Việt Nam:
  - `Date`: `dd/MM/yyyy`
  - `Time`: `HH:mm`
  - `DateTime`: `dd/MM/yyyy HH:mm`

**Non-Goals:**

- Không tạo/xóa Shift
- Không chỉnh `WorkingTime`, `LateGrace`, `ShiftCode`
- Không tạo tab/page admin mới
- Không giải quyết sync 2 chiều với WiseEye software
- Không migrate toàn bộ màn date/time trong một bước; rollout theo phase

## Decisions

### 1. Write trực tiếp vào WiseEye DB

**Decision**: UPDATE `dbo.Shifts` trực tiếp trên WiseEye SQL Server, không tạo bảng override trên App DB.

**Rationale**: WiseEye DB vẫn là single source of truth. Attendance, notification và history đều đọc từ đó nên thay đổi có hiệu lực ngay, không cần merge layer trung gian.

### 2. Audit trail trên App DB

**Decision**: Ghi log vào `dbo.shift_audit_logs` trên App DB.

**Rationale**: Không muốn tạo thêm bảng trên DB của hệ thống bên thứ ba.

### 3. UI shift editor nằm trong tab `Hệ thống`

**Decision**: Thêm card `Ca làm việc` vào tab `Hệ thống` với bảng inline-editable. Card `Đồng bộ Giờ` được rút gọn.

**Rationale**: Đây là thao tác cấu hình hệ thống, hợp với tab hiện có và tránh mở thêm màn mới.

### 4. `OnLunch` / `OffLunch` nullable

**Decision**: Cho phép admin để trống `OnLunch` và `OffLunch` (lưu `NULL`).

**Rationale**: Một số ca không có nghỉ trưa. UI cần hỗ trợ empty state và clear action rõ ràng.

### 5. Shared temporal input system cho renderer

**Decision**: Tạo một shared component set gồm:

- `MonthPicker`
- `DatePicker`
- `TimePicker`
- `DateTimePicker`

Ba component này dùng chung một temporal field pattern: label, trigger/input, popup, clear action, disabled/error/helper states và keyboard-first interaction.

**Rationale**:**

- Tránh native picker mặc định lệ thuộc browser/OS
- Đồng bộ visual language giữa các màn
- Tách rõ display format và storage format
- Giảm lặp logic parse/normalize ngày giờ ở renderer

### 6. Chuẩn format hiển thị và nhập liệu

**Decision**:

- `MonthPicker` hiển thị `MM/yyyy`
- `DatePicker` hiển thị `dd/MM/yyyy`
- `TimePicker` hiển thị `HH:mm` 24h
- `DateTimePicker` hiển thị `dd/MM/yyyy HH:mm`

Canonical data format phía app/API vẫn giữ riêng:

- month: `YYYY-MM`
- date: `YYYY-MM-DD`
- time: `HH:mm`
- datetime: ISO / SQL string theo từng layer

**Rationale**: UI cần đúng kỳ vọng người dùng Việt Nam, trong khi storage format phải ổn định cho service và DB.

### 7. `TimePicker` là custom control tối giản, hybrid input

**Decision**:

- `TimePicker` là custom component, không dùng native `input[type="time"]` ở business screens
- Cho phép vừa gõ tay vừa chọn nhanh từ popup
- Popup mặc định hiển thị theo step `5 phút`
- Nếu user gõ `07:32` thì giữ nguyên `07:32`, không auto round; chỉ validate format hợp lệ `HH:mm`

**Rationale**: Ưu tiên tốc độ thao tác nhưng không tước quyền kiểm soát của user.

### 8. `DateTimePicker` được compose từ `DatePicker` + `TimePicker`

**Decision**: Không làm một control “all-in-one” quá nặng ở phase đầu. `DateTimePicker` sẽ compose từ 2 component con dùng chung nền temporal field.

**Rationale**: Dễ maintain hơn, test đơn giản hơn, và giảm coupling trong renderer.

### 9. Rollout theo phase

**Decision**:

- Phase 1: tạo shared temporal components và migrate màn admin shift
- Phase 2: migrate các màn/filter ngày giờ còn lại trong app, bắt đầu từ trang `Lịch sử chấm công` và editor `Lịch Auto-Switch` ở tab `Máy chấm công`
- Phase 3: dọn style cũ và loại bỏ native picker ad-hoc

**Rationale**: Tránh scope nổ quá lớn trong một change và vẫn tạo được nền dùng chung thật sự.

### 10. `MonthPicker` cho các flow lọc theo tháng

**Decision**:

- Thêm `MonthPicker` shared cho các màn đang dùng native `input[type="month"]`
- `MonthPicker` hiển thị `MM/yyyy`, nhưng value canonical vẫn là `YYYY-MM`
- Trang `Lịch sử chấm công` dùng `MonthPicker` cho filter tháng mặc định, đồng thời vẫn giữ chế độ lọc theo khoảng ngày với `DatePicker`

**Rationale**:

- Giữ đồng bộ temporal UI trên các màn có lọc tháng
- Tránh để `HistoryPage` chỉ migrate một nửa khi `start/end` đã shared nhưng `month` vẫn native
- Canonical query param hiện tại đã ổn định theo `YYYY-MM`, nên chỉ cần thay lớp hiển thị/interaction ở renderer

### 11. Temporal popover surfaces render outside clipped layout contexts

**Decision**:

- Popup của `DatePicker`, `MonthPicker`, `TimePicker` render qua portal lên `document.body`
- Vị trí popup được clamp theo viewport để không tràn mép phải/trái
- Nếu không đủ chỗ phía dưới thì popup được phép bật lên phía trên anchor
- Click lại vào input đang focus phải mở lại popup, không bắt user blur rồi focus lại

**Rationale**:

- Tránh popup bị che/cắt bởi `overflow`, card/table container, hoặc layout gần mép viewport
- Giữ interaction nhanh và tự nhiên cho desktop form/filter flows
- Sửa một lần ở shared primitive thay vì vá từng màn như `HistoryPage` hay admin schedule editor

### 12. Empty optional range fields stay neutral

**Decision**:

- Với các field range/filter mang tính optional như `Từ ngày` / `Đến ngày` ở `HistoryPage`, empty state được coi là hợp lệ
- Chỉ hiển thị lỗi khi user thực sự nhập sai định dạng, không báo đỏ chỉ vì field đang trống

**Rationale**:

- Người dùng thường focus một đầu range trước khi quyết định có nhập hay không
- Trạng thái “chưa chọn gì” phải là neutral, không nên bị coi là lỗi validation
- Giữ trải nghiệm filter nhẹ nhàng hơn trong các flow tra cứu

## Risks / Trade-offs

- **Custom picker tốn effort hơn native input** -> chấp nhận để đổi lấy UI đồng bộ và kiểm soát interaction
- **Accessibility/keyboard/click-outside cần làm kỹ** -> phải có test và interaction rules rõ ngay từ đầu
- **Migration toàn app không nên làm một lần** -> rollout theo phase để giảm regression risk
- **WiseEye software có thể ghi đè shift** -> chấp nhận, WiseEye vẫn là master
- **Thay đổi shift ảnh hưởng nhiều nhân viên** -> warning text ngắn gọn + audit trail đầy đủ
