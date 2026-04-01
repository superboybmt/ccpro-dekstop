## ADDED Requirements

### Requirement: Notification list display
The system SHALL display a list of notifications relevant to the employee's attendance, sorted by time descending. Notifications SHALL include: late check-in alerts, missing check-out reminders, and system announcements.

#### Scenario: View notifications
- **WHEN** employee navigates to Notifications screen
- **THEN** system displays all notifications with title, description, timestamp, and read/unread status

#### Scenario: No notifications
- **WHEN** employee has no notifications
- **THEN** system displays "Không có thông báo mới"

### Requirement: Late check-in notification
The system SHALL generate a notification when the employee checks in after the shift's `Onduty` time plus `LateGrace` minutes.

#### Scenario: Late arrival detected
- **WHEN** employee checks in 15 minutes after shift start (and LateGrace is 10 minutes)
- **THEN** system creates a notification: "Bạn đã đi trễ 15 phút ngày DD/MM/YYYY"

### Requirement: Missing check-out reminder
The system SHALL generate a reminder notification if the employee has a check-in but no check-out by shift's `Offduty` time plus 30 minutes.

#### Scenario: Missing check-out
- **WHEN** shift ends at 17:00 and no check-out recorded by 17:30
- **THEN** system creates a notification: "Bạn chưa chấm ra ngày DD/MM/YYYY"

### Requirement: Mark notification as read
The system SHALL allow employees to mark individual notifications as read or mark all as read.

#### Scenario: Mark single notification read
- **WHEN** employee clicks on a notification
- **THEN** notification is marked as read and visual indicator updates

#### Scenario: Mark all as read
- **WHEN** employee clicks "Đánh dấu đã đọc tất cả"
- **THEN** all notifications are marked as read
