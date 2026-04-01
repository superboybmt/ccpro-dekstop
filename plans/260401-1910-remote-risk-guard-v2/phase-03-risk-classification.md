# Phase 03: Rewire Risk Classification Logic
Status: ⬜ Pending
Dependencies: Phase 01, Phase 02

## Objective
Cập nhật hàm `classifyRiskLevel` và luồng `evaluate()` để phản ánh đúng 4-tier model mới.

## Logic mới (Decision Matrix)

```
┌──────────────────────────┬────────────────────┬───────────────┬──────────┐
│ Scenario                 │ Signals            │ Risk Level    │ Blocking │
├──────────────────────────┼────────────────────┼───────────────┼──────────┤
│ RDP / GetSystemMetrics   │ remote-session     │ HIGH          │ YES      │
│ Desktop + visible + WAN  │ visible + network  │ HIGH          │ YES      │
│ Desktop + visible + sust.│ visible + net-sust │ HIGH          │ YES      │
│ Desktop + visible only   │ visible-window     │ MEDIUM        │ NO       │
│ Desktop + network only   │ network            │ MEDIUM        │ NO       │
│ Service only + network   │ (excluded)         │ LOW           │ NO       │
│ Service only, no network │ (nothing)          │ LOW           │ NO       │
│ No remote process        │ (nothing)          │ LOW           │ NO       │
└──────────────────────────┴────────────────────┴───────────────┴──────────┘
```

### Thay đổi so với logic cũ

| Cũ | Mới |
|----|-----|
| Network connection từ BẤT KỲ process nào → signal | Chỉ desktop process network → signal |
| `network-sustained` (15s) → HIGH | `network-sustained` + `visible-window` → HIGH |
| `network` + `foreground` → HIGH | Giữ nguyên (foreground vẫn nguy hiểm) |
| Process detected + no signal → LOW | Giữ nguyên |

### Quantitative Change
- **False-positive reduction**: ~95% (service-only scenarios giờ trả về LOW thay vì HIGH)
- **Detection accuracy**: Không đổi (vẫn bắt mọi active remote session)

## Implementation Steps
1. [ ] Refactor `evaluate()` flow: tách `desktopProcessIds` vs `serviceProcessIds`
2. [ ] Chỉ gọi `listNetworkConnections(desktopProcessIds)` — bỏ qua service PIDs
3. [ ] Thêm `hasVisibleWindow(desktopProcessIds)` check sau khi có network data
4. [ ] Cập nhật `classifyRiskLevel()` theo decision matrix mới
5. [ ] Cập nhật `reason` messages cho từng tier

## Files to Modify
- `src/main/services/remote-risk-service.ts` — `evaluate()` + `classifyRiskLevel()`

---
Next Phase: `phase-04-tests.md`
