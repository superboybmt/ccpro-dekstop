# Phase 01: Refactor Process Classification
Status: ⬜ Pending
Dependencies: None

## Objective
Phân biệt giữa **Service process** (chạy nền, vô hại) và **Desktop/GUI process** (có khả năng đang bị remote) trong danh sách denylist.

## Thay đổi cốt lõi

### Cập nhật `REMOTE_TOOL_DEFINITIONS`

Chuyển từ flat list sang cấu trúc phân loại:

```typescript
const REMOTE_TOOL_DEFINITIONS = [
  {
    name: 'UltraViewer',
    serviceProcesses: ['ultraviewer_service'],      // Bỏ qua network
    desktopProcesses: ['ultraviewer_desktop', 'ultraviewer']  // Theo dõi
  },
  {
    name: 'TeamViewer',
    serviceProcesses: ['teamviewer_service'],
    desktopProcesses: ['teamviewer']
  },
  {
    name: 'AnyDesk',
    serviceProcesses: ['anydesk_service'],
    desktopProcesses: ['anydesk']
  },
  {
    name: 'RustDesk',
    serviceProcesses: [],
    desktopProcesses: ['rustdesk']
  }
] as const
```

### Tách `isDenylisted` thành 2 hàm

```typescript
isServiceProcess(name)   → true nếu là service (bỏ qua khi tính network)
isDesktopProcess(name)   → true nếu là desktop/GUI (theo dõi network)
isDenylisted(name)       → true nếu thuộc bất kỳ nhóm nào (để liệt kê cho UI)
```

## Implementation Steps
1. [ ] Refactor `REMOTE_TOOL_DEFINITIONS` type sang `{ name, serviceProcesses, desktopProcesses }`
2. [ ] Implement `isServiceProcess()` helper
3. [ ] Implement `isDesktopProcess()` helper
4. [ ] Update `isDenylisted()` để match cả 2 nhóm
5. [ ] Trong `evaluate()`: chỉ truyền PIDs của **desktop processes** vào `listNetworkConnections()`
6. [ ] Export `__internal` test helpers cho 2 hàm mới

## Files to Modify
- `src/main/services/remote-risk-service.ts` — core logic

## Test Criteria
- [ ] `isDenylisted('UltraViewer_Service.exe')` → `true`
- [ ] `isServiceProcess('UltraViewer_Service.exe')` → `true`
- [ ] `isDesktopProcess('UltraViewer_Service.exe')` → `false`
- [ ] `isDesktopProcess('UltraViewer_Desktop.exe')` → `true`

---
Next Phase: `phase-02-window-visibility.md`
