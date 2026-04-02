## Why

Hiện tại, avatar user chỉ hiển thị dạng chữ viết tắt (initials) được tự động tạo từ fullName. Nhân viên không có khả năng cá nhân hóa ảnh đại diện. Với quy mô ~70 user, việc cho phép upload ảnh avatar sẽ tăng tính nhận diện cá nhân, giúp trải nghiệm ứng dụng trở nên thân thiện và chuyên nghiệp hơn.

## What Changes

- Thêm khả năng upload ảnh avatar cho user tại trang Settings (tab Hồ sơ)
- Client-side crop ảnh tỉ lệ 1:1 và nén sang WebP trước khi gửi lên
- Lưu ảnh dưới dạng Base64 string trong bảng `app_users` (DB SQL Server) — phù hợp app portable, ~70 user, mỗi ảnh <100KB
- Component `Avatar` hiển thị ảnh thật khi có, fallback về initials khi chưa có ảnh
- Optimistic Update: cập nhật ảnh mới ngay lập tức trên toàn bộ UI (Sidebar, Settings) trước khi API phản hồi
- Thêm API IPC `settings.updateAvatar(base64)` và `settings.removeAvatar()`

## Capabilities

### New Capabilities
- `user-avatar`: Cho phép user upload, crop, preview và lưu ảnh avatar cá nhân. Bao gồm client-side image processing (crop 1:1, nén WebP, chuyển Base64), lưu trữ trong DB, hiển thị trên Avatar component, và đồng bộ real-time qua global state.

### Modified Capabilities
_(Không có capability hiện hữu nào bị thay đổi requirement)_

## Impact

- **Database**: Thêm cột `avatar_base64` (nvarchar(max)) vào bảng `dbo.app_users`
- **Shared API types**: Mở rộng `AuthUser` thêm trường `avatarBase64`, mở rộng `RendererApi.settings` thêm 2 method
- **Backend services**: `auth-service.ts` cần đọc/ghi avatar, thêm `avatar-service.ts` mới
- **Frontend components**: Nâng cấp `Avatar` component, thêm `AvatarUploader` component (crop modal), cập nhật `settings-page.tsx` và `sidebar.tsx`
- **State management**: Mở rộng `auth-provider` để giữ avatar trong global state và hỗ trợ optimistic update
- **Dependencies mới**: `react-easy-crop` (crop UI), browser-native Canvas API (resize/compress)
