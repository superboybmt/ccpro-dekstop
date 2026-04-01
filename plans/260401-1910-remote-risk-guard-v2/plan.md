# Plan: Remote Risk Guard v2 — Hybrid 4-Tier Detection
Created: 2026-04-01 19:10
Status: 🟡 In Progress

## Overview

Nâng cấp hệ thống phát hiện phần mềm điều khiển từ xa (UltraViewer, TeamViewer, AnyDesk, RustDesk) từ logic đơn giản "thấy process + network → block" sang mô hình 4 tầng thông minh hơn. Mục tiêu: **loại bỏ false-positive** khi tool remote chỉ chạy service ngầm, nhưng vẫn chặn chính xác khi có phiên remote thật sự hoạt động.

## Vấn đề hiện tại

UltraViewer Service luôn duy trì TCP heartbeat đến relay server → logic cũ coi là `network-sustained` → block chấm công ngay cả khi **không có ai** đang remote vào máy.

## Giải pháp: 4-Tier Hybrid Detection

```
Tier 1: Win32 API — GetSystemMetrics(SM_REMOTESESSION)
        → RDP/Terminal Services? → HIGH ngay lập tức

Tier 2: Process Classification — Service vs Desktop/GUI
        ├── Chỉ có Service process → LOW (bỏ qua)
        └── Có Desktop/GUI process → Tiếp Tier 3

Tier 3: Window Visibility Check — EnumWindows()
        ├── Không có cửa sổ visible → LOW (chạy ngầm)
        └── Có cửa sổ visible → MEDIUM (audit)

Tier 4: Network + Visibility Combo
        ├── Visible window + WAN connection → HIGH → BLOCK
        └── Visible window + chỉ LAN/localhost → MEDIUM
```

## Tech Stack
- **Runtime**: Electron Main Process (Node.js)
- **Win32 API**: PowerShell inline C# (`Add-Type`)
- **Testing**: Vitest with mock detector
- **Affected files**: `remote-risk-service.ts`, `attendance-service.ts` (minimal), test files

## Phases

| Phase | Name | Status | Est. Tasks |
|-------|------|--------|------------|
| 01 | Refactor Process Classification | ⬜ Pending | 6 |
| 02 | Win32 Window Visibility Probe | ⬜ Pending | 5 |
| 03 | Rewire Risk Classification Logic | ⬜ Pending | 5 |
| 04 | Update Tests + Verification | ⬜ Pending | 8 |

**Tổng:** 24 tasks | Ước tính: 1-2 sessions

## Không thay đổi (Out of scope)
- Admin Settings UI (đã có `policyMode` toggle hoạt động tốt)
- Audit logging trong `attendance-service.ts` (đã hoạt động chính xác)
- `RemoteRiskDetector` interface (chỉ thêm method mới, backward-compatible)

## Quick Commands
- Xem phase 1: mở `phase-01-process-classification.md`
- Bắt đầu code: `/code phase-01`
- Check progress: `/next`
