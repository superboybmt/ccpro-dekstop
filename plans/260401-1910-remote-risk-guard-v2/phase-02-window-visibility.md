# Phase 02: Win32 Window Visibility Probe
Status: ⬜ Pending
Dependencies: Phase 01

## Objective
Thêm khả năng kiểm tra xem một process có **cửa sổ hiển thị** (visible window) hay không, sử dụng Win32 API `EnumWindows`. Đây là tín hiệu quan trọng để phân biệt "tool chạy ngầm" vs "đang có phiên remote active".

## Thiết kế

### Thêm method vào `RemoteRiskDetector` interface

```typescript
interface RemoteRiskDetector {
  // ...existing methods...
  hasVisibleWindow(processIds: number[]): Promise<boolean>
}
```

### PowerShell Win32 Script

```powershell
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class WindowProbe {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  public static List<uint> GetVisibleWindowPids() {
    var pids = new List<uint>();
    EnumWindows((hWnd, _) => {
      if (IsWindowVisible(hWnd)) {
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        if (pid > 0) pids.Add(pid);
      }
      return true;
    }, IntPtr.Zero);
    return pids;
  }
}
"@
$targetPids = @(PLACEHOLDER_PIDS)
$visiblePids = [WindowProbe]::GetVisibleWindowPids()
$hasVisible = ($targetPids | Where-Object { $visiblePids -contains $_ }).Count -gt 0
ConvertTo-Json @{ hasVisible = $hasVisible } -Compress
```

### Thêm `GetSystemMetrics(SM_REMOTESESSION)` cho Tier 1

```powershell
Add-Type @"
using System.Runtime.InteropServices;
public static class SessionProbe {
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
  public static bool IsRemoteSession() => GetSystemMetrics(0x1000) != 0;
}
"@
```

Cập nhật `isRemoteSessionActive()` để kết hợp cả `SESSIONNAME` check VÀ `GetSystemMetrics`.

## Implementation Steps
1. [ ] Thêm `hasVisibleWindow(processIds: number[])` vào `RemoteRiskDetector` interface
2. [ ] Implement PowerShell `EnumWindows` script trong `WindowsRemoteRiskDetector`
3. [ ] Upgrade `isRemoteSessionActive()` với `GetSystemMetrics(SM_REMOTESESSION)` (Tier 1)
4. [ ] Gọi `hasVisibleWindow()` trong `evaluate()` chỉ với danh sách desktop process PIDs
5. [ ] Thêm signal `'visible-window'` vào `activeSignals` khi phát hiện

## Files to Modify
- `src/main/services/remote-risk-service.ts` — detector + evaluate logic

## Test Criteria
- [ ] Mock `hasVisibleWindow` → `false` + process detected → level `low`
- [ ] Mock `hasVisibleWindow` → `true` + no network → level `medium`
- [ ] Mock `hasVisibleWindow` → `true` + WAN network → level `high`
- [ ] `GetSystemMetrics` mock → `true` → level `high` (RDP detected)

---
Next Phase: `phase-03-risk-classification.md`
