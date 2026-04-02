## 1. Database & Shared Types

- [x] 1.1 Thêm cột `avatar_base64 NVARCHAR(MAX) NULL` vào bảng `dbo.app_users` (migration SQL)
- [x] 1.2 Thêm trường `avatarBase64?: string` vào interface `AuthUser` trong `src/shared/api.ts`
- [x] 1.3 Thêm method `updateAvatar(base64: string): Promise<MutationResult>` và `removeAvatar(): Promise<MutationResult>` vào `RendererApi.settings` trong `src/shared/api.ts`

## 2. Backend Service

- [x] 2.1 Cập nhật `AuthService.serializeUser()` trong `src/main/services/auth-service.ts` để đọc và trả về `avatarBase64` từ DB
- [x] 2.2 Thêm query SELECT `avatar_base64` trong `SqlAuthRepository` khi tìm app user
- [x] 2.3 Tạo `src/main/services/avatar-service.ts` với 2 method: `updateAvatar(userEnrollNumber, base64)` và `removeAvatar(userEnrollNumber)`
- [x] 2.4 Đăng ký IPC handlers cho `settings.updateAvatar` và `settings.removeAvatar` trong main process

## 3. Frontend - Avatar Component Upgrade

- [x] 3.1 Mở rộng `Avatar` component (`src/renderer/src/components/ui/avatar.tsx`): thêm prop `src?: string`, render `<img>` khi có src, fallback về initials
- [x] 3.2 Cập nhật CSS cho Avatar component: thêm style cho `<img>` element (object-fit: cover, border-radius: 50%)

## 4. Frontend - AvatarUploader Component

- [x] 4.1 Cài đặt dependency `react-easy-crop`
- [x] 4.2 Tạo utility function `cropAndCompress(file, cropArea)` sử dụng Canvas API: crop 1:1 → resize 400×400 → WebP 0.8 → Base64 string
- [x] 4.3 Tạo component `AvatarUploader` (`src/renderer/src/components/ui/avatar-uploader.tsx`): File input + Crop Modal + Preview + Nút "Lưu" / "Hủy" / "Xóa ảnh"
- [x] 4.4 Validate file: kiểm tra file size ≤ 10MB trước khi mở crop modal

## 5. Frontend - Settings Page Integration

- [x] 5.1 Import và sử dụng `AvatarUploader` trong `src/renderer/src/pages/settings-page.tsx`
- [x] 5.2 Implement logic gọi API `window.api.settings.updateAvatar(base64)`
- [x] 5.3 Implement logic gọi API `window.api.settings.removeAvatar()`
- [x] 5.4 Sử dụng `onUpdate` hoặc custom event/context để cập nhật lại context (hoặc re-fetch dữ liệu `user`) sau khi cập nhật avatar thành công

## 6. State Management - Optimistic Update

- [x] 6.1 Mở rộng `auth-provider` để expose method `updateUserAvatar(base64: string | null)` cập nhật `AuthUser.avatarBase64` trong global state
- [x] 6.2 Implement optimistic update flow trong `AvatarUploader`: cập nhật state trước → gọi API → rollback nếu lỗi
- [x] 6.3 Cập nhật `Sidebar` component: truyền `user.avatarBase64` vào Avatar component

## 7. Preload Bridge

- [x] 7.1 Expose `settings.updateAvatar` và `settings.removeAvatar` qua preload bridge (`src/preload/index.ts`)

## 8. Testing & Verification

- [ ] 8.1 Kiểm tra upload ảnh JPEG, PNG, WebP → crop → lưu → hiển thị trên Sidebar + Settings
- [ ] 8.2 Kiểm tra optimistic update: ảnh hiện ngay trước khi API phản hồi
- [ ] 8.3 Kiểm tra xóa ảnh → revert về initials
- [ ] 8.4 Kiểm tra user mới chưa có row trong app_users → upload avatar vẫn hoạt động
- [ ] 8.5 Kiểm tra file > 10MB bị reject với thông báo lỗi
