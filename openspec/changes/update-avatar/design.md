## Context

App CCPro là ứng dụng Electron (portable) quản lý chấm công cho ~70 nhân viên. Hiện tại, avatar chỉ hiển thị bằng chữ viết tắt (initials) được sinh tự động từ `fullName`. User không có cách nào upload ảnh đại diện cá nhân.

**Kiến trúc hiện tại:**
- **Database:** SQL Server, bảng `dbo.app_users` chứa thông tin đăng nhập user
- **Backend:** Electron main process, `AuthService` xử lý auth + trả về `AuthUser` object
- **Frontend:** React + React Router, `Avatar` component render initials, `auth-provider` giữ global session state
- **IPC Layer:** `RendererApi` (shared types) ↔ preload bridge ↔ main process handlers

## Goals / Non-Goals

**Goals:**
- User có thể upload, crop, preview và lưu ảnh avatar từ trang Settings
- Avatar hiển thị nhất quán trên toàn app (Sidebar, Settings) ngay lập tức (optimistic update)
- Ảnh được nén đủ nhỏ (<100KB) trước khi lưu, không gây ảnh hưởng hiệu năng DB

**Non-Goals:**
- Admin quản lý/đổi avatar hộ user (ngoài scope)
- Sync avatar lên cloud hoặc CDN bên ngoài
- Hỗ trợ animated GIF hoặc video avatar
- Resize trên server-side (mọi xử lý ảnh diễn ra hoàn toàn phía client)

## Decisions

### 1. Lưu trữ: Base64 trong SQL Server
**Chọn:** Thêm cột `avatar_base64 NVARCHAR(MAX)` vào bảng `dbo.app_users`

**Alternatives considered:**
- *Lưu file ra disk:* App portable không có thư mục cố định, path thay đổi mỗi lần chạy → **loại**
- *Lưu vào SQLite riêng:* Thêm DB thứ 3 (cạnh wise-eye + app) phức tạp hóa kiến trúc không cần thiết → **loại**
- *Embed vào electron store:* Chỉ lưu local, các máy khác không thấy được → **loại**

**Rationale:** Với 70 user × ~100KB/ảnh = ~7MB total. SQL Server xử lý thoải mái. Base64 chạy thẳng trong `<img src="data:image/webp;base64,...">` không cần thêm static file server.

### 2. Image Processing: Client-side Canvas API
**Chọn:** Dùng `react-easy-crop` để crop UI + HTML Canvas API để resize/compress

**Flow:**
```
File Picker → react-easy-crop (định khung 1:1)
    → Canvas.drawImage() (resize xuống 400×400)
    → Canvas.toBlob('image/webp', 0.8)
    → FileReader.readAsDataURL() → Base64 string
    → Gửi qua IPC
```

**Rationale:** Không cần thêm dependency nặng (sharp, jimp). Canvas API có sẵn trong Chromium/Electron. WebP cho chất lượng/dung lượng tối ưu.

### 3. State Sync: Mở rộng AuthUser + auth-provider
**Chọn:** Thêm `avatarBase64?: string` vào `AuthUser` interface. Khi upload xong, cập nhật trực tiếp state trong `auth-provider`.

**Optimistic Update Flow:**
```
User bấm Save → Set avatarBase64 = localBlob vào global state → UI cập nhật ngay
    → Gọi IPC uploadAvatar(base64) → Thành công: giữ nguyên
                                     → Thất bại: rollback về giá trị cũ + show error
```

**Rationale:** `auth-provider` đã là single source of truth cho `AuthUser`. Sidebar và mọi trang đều subscribe vào đây, không cần event bus hay custom hook thêm.

### 4. Component Architecture

```
Avatar (upgraded)
├── Nhận thêm prop `src?: string`
├── Nếu có src → render <img>
└── Nếu không → render initials (giữ nguyên behavior cũ)

AvatarUploader (new)
├── Click vào Avatar → mở File Input (accept="image/*")
├── Chọn file → mở CropModal (react-easy-crop, aspect=1)
├── Xác nhận crop → Canvas resize+compress → base64
└── Gọi callback onUpload(base64)

SettingsPage (modified)
├── Tab Hồ sơ: thêm AvatarUploader phía trên form thông tin
└── Hook vào auth-provider để optimistic update
```

### 5. IPC API Design

```typescript
// Thêm vào RendererApi.settings
settings: {
  getProfile(): Promise<SettingsProfile>
  getAppInfo(): Promise<AppInfo>
  updateAvatar(base64: string): Promise<MutationResult>  // NEW
  removeAvatar(): Promise<MutationResult>                 // NEW
}
```

### 6. Database Migration
```sql
ALTER TABLE dbo.app_users
ADD avatar_base64 NVARCHAR(MAX) NULL;
```
Cột nullable, default NULL. Không ảnh hưởng data hiện hữu. Rollback = DROP COLUMN.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Base64 string lớn chiếm RAM khi load danh sách user | Chỉ load avatar của user đang đăng nhập (1 chuỗi duy nhất), admin list KHÔNG load avatar |
| WebP không được hỗ trợ trên mọi trình duyệt | Electron dùng Chromium → WebP luôn được hỗ trợ 100% |
| User upload ảnh >5MB gốc gây lag client | Canvas resize trước khi convert, output luôn ≤400×400 ~50-100KB |
| SQL Server query chậm vì cột NVARCHAR(MAX) | Cột này không nằm trong WHERE/JOIN/INDEX. Chỉ SELECT khi cần hiển thị → không ảnh hưởng |
| Migration fail trên production | Đây là ALTER TABLE ADD COLUMN, an toàn nhất trong các loại migration. Rollback = DROP COLUMN |
