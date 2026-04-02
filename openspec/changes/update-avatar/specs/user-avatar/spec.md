## ADDED Requirements

### Requirement: User can upload avatar image
User SHALL be able to upload a personal avatar image from the Settings page (tab Hồ sơ). The system SHALL accept image files in JPEG, PNG, and WebP formats.

#### Scenario: Successful avatar upload
- **WHEN** user clicks on their current avatar in Settings > Hồ sơ
- **THEN** system opens a file picker dialog accepting image files (JPEG, PNG, WebP)

#### Scenario: File too large
- **WHEN** user selects an image file larger than 10MB
- **THEN** system shows an error message "Ảnh quá lớn. Vui lòng chọn ảnh dưới 10MB" and does NOT open the crop modal

#### Scenario: Invalid file type
- **WHEN** user selects a non-image file (e.g., PDF, TXT)
- **THEN** system rejects the file via the file picker's accept filter

---

### Requirement: User can crop avatar to square ratio
After selecting an image, user SHALL be presented with a crop interface to select a 1:1 (square) region of the image before saving.

#### Scenario: Crop modal opens after file selection
- **WHEN** user selects a valid image file
- **THEN** system displays a modal with the image loaded in a 1:1 crop interface

#### Scenario: User confirms crop
- **WHEN** user adjusts the crop area and clicks "Lưu"
- **THEN** system extracts the cropped region, resizes to 400×400 pixels, compresses to WebP format (quality 0.8), and converts to Base64

#### Scenario: User cancels crop
- **WHEN** user clicks "Hủy" or presses Escape in the crop modal
- **THEN** system closes the modal without making any changes to the avatar

---

### Requirement: Avatar is stored as Base64 in database
The cropped avatar image SHALL be stored as a Base64-encoded string in the `avatar_base64` column of the `dbo.app_users` table.

#### Scenario: Avatar saved to database
- **WHEN** the cropped Base64 string is sent via IPC `settings.updateAvatar(base64)`
- **THEN** backend writes the string to `avatar_base64` column for the current user and returns `{ ok: true, message: 'Cập nhật ảnh đại diện thành công' }`

#### Scenario: User has no app_users record yet
- **WHEN** user uploads an avatar but does not have an existing row in `dbo.app_users`
- **THEN** system creates a new row with the avatar_base64 value populated

---

### Requirement: Avatar component displays image when available
The `Avatar` component SHALL display the user's uploaded image when available, and fall back to displaying initials when no avatar image exists.

#### Scenario: User has uploaded avatar
- **WHEN** `AuthUser.avatarBase64` is a non-empty string
- **THEN** Avatar component renders an `<img>` element with `src="data:image/webp;base64,{avatarBase64}"`

#### Scenario: User has no avatar
- **WHEN** `AuthUser.avatarBase64` is null or undefined
- **THEN** Avatar component renders the initials text (existing behavior, unchanged)

---

### Requirement: Avatar updates are reflected immediately across the app
When user uploads a new avatar, all instances of the Avatar component (Sidebar, Settings) SHALL update immediately without requiring page reload.

#### Scenario: Optimistic update on upload
- **WHEN** user confirms a new avatar crop
- **THEN** the avatar image updates in the Sidebar and Settings page within 100ms, before the backend API responds

#### Scenario: Rollback on API failure
- **WHEN** the backend API call fails after optimistic update
- **THEN** the avatar reverts to the previous state (old image or initials) and an error toast/message is displayed

---

### Requirement: User can remove their avatar
User SHALL be able to remove their uploaded avatar and revert to displaying initials.

#### Scenario: Remove avatar
- **WHEN** user clicks a "Xóa ảnh" button (visible only when an avatar exists)
- **THEN** system calls IPC `settings.removeAvatar()`, sets `avatar_base64` to NULL in database, and reverts Avatar component to displaying initials
