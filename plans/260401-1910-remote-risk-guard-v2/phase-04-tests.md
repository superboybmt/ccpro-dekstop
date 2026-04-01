# Phase 04: Update Tests + Verification
Status: ⬜ Pending
Dependencies: Phase 01, 02, 03

## Objective
Cập nhật và mở rộng test suite để cover đầy đủ 4-tier model mới, bao gồm cả các kịch bản false-positive đã được khắc phục.

## Test Cases (Mới + Cập nhật)

### Tier 1: RDP Detection
- [ ] `GetSystemMetrics` returns remote session → HIGH (đã có, cần verify)
- [ ] `SESSIONNAME=RDP-Tcp#0` → HIGH (đã có, cần verify)

### Tier 2: Process Classification
- [ ] Chỉ service process (UltraViewer_Service) + network → **LOW** ⭐ (CASE FIX CHÍNH)
- [ ] Service + Desktop process, chỉ service có network → **LOW**
- [ ] Desktop process chạy, không có gì khác → **LOW**

### Tier 3: Window Visibility
- [ ] Desktop process + visible window + no network → **MEDIUM**
- [ ] Desktop process + no visible window + network → **MEDIUM** (background connection)
- [ ] Desktop process + visible window + WAN network → **HIGH**

### Tier 4: Combo Signals
- [ ] Desktop + visible + network-sustained (15s) → **HIGH**
- [ ] Desktop + foreground + network → **HIGH** (giữ nguyên behavior cũ)
- [ ] Desktop + visible + LAN-only connection → **MEDIUM**

### Edge Cases
- [ ] Multiple remote tools (UltraViewer service + AnyDesk desktop) → classify theo tool nguy hiểm nhất
- [ ] Empty process list → LOW
- [ ] PowerShell timeout → graceful fallback to LOW

## Verification Checklist
- [ ] Tất cả 7 test cũ vẫn PASS (sau khi cập nhật expectations cho cases bị thay đổi)
- [ ] Tổng test count ≥ 12
- [ ] Chạy `npm run test` thành công
- [ ] Manual test: khởi động UltraViewer service → dashboard hiện LOW → chấm công thành công

## Files to Modify
- `src/main/services/__tests__/remote-risk-service.test.ts` — tests
- `src/renderer/src/pages/__tests__/dashboard-error-state.test.tsx` — UI tests (nếu cần)

---
Hoàn thành: Merge + deploy
