# ZK Shortkey And Notification Design

**Date:** 2026-04-01

**Status:** Approved in conversation, pending written-spec review

## Goal

Implement two focused changes:

1. Add a Windows-only internal prototype tool to read/write ZKTeco shortcut key auto-switch settings through the official SDK entry points around `SSR_GetShortkey` / `SSR_SetShortkey`.
2. Replace notification logic that currently depends on raw `CheckInOut.OriginType` with logic derived from WiseEye schedule and in/out window configuration.

## Context

- The attendance device is an `8000T` on platform `ZMM200_TFT`.
- The current app can write simple device options like `StateMode`, but not shortcut auto-change schedules.
- Public ZKTeco documentation indicates attendance state auto-switch is configured through shortcut keys and `StateAutoChangeTime`.
- WiseEye already stores schedule-driven in/out classification metadata in:
  - `Schedule.InOutID`
  - `InOutArr`
  - `InOut`
- Current notifications use raw `OriginType = I/O`, which becomes unreliable when device UI is locked or users choose the wrong status.

## Workstream A: ZK Shortkey Prototype

### Scope

Build a Windows-only internal tool first. Do not integrate directly into the Electron app yet.

### Recommended Approach

Use a PowerShell script with a small embedded C# COM interop layer against the official ZKTeco Windows SDK / `zkemkeeper`.

### Why This Approach

- Lowest implementation risk for a Windows-only prototype
- Keeps COM/SDK complexity outside the app during exploration
- Easy to validate against the real `8000T` before app integration
- Reusable later as a stable internal bridge

### Tool Responsibilities

- Connect to the target device using IP / port / password
- Read shortcut key configuration for F1..F4
- Set one shortcut key at a time
- Return structured JSON output for repeatable testing

### Proposed Interface

Read current config:

```powershell
powershell -File scripts/zk-shortkey-tool.ps1 get --ip 10.60.1.5 --port 4370 --password 938948
```

Write one shortcut key:

```powershell
powershell -File scripts/zk-shortkey-tool.ps1 set --ip 10.60.1.5 --port 4370 --password 938948 --shortKeyId 1 --stateCode 0 --stateName "Vao sang" --autoChange 1 --autoChangeTime "07:30;07:30;07:30;07:30;07:30;00:00;00:00;"
```

### Expected Output Shape

```json
{
  "deviceIp": "10.60.1.5",
  "deviceName": "8000T",
  "shortKeys": [
    {
      "shortKeyId": 1,
      "shortKeyFun": 1,
      "stateCode": 0,
      "stateName": "Vao sang",
      "autoChange": 1,
      "autoChangeTime": "07:30;07:30;07:30;07:30;07:30;00:00;00:00;"
    }
  ]
}
```

### Test Strategy

1. Read existing F1..F4 configuration and save it.
2. Set a single test shortcut key with auto-change time.
3. Read back configuration from software.
4. Verify UI behavior on the physical device.
5. Restore original key settings.

### Risks

- COM registration / SDK bitness mismatch on Windows
- Device-specific differences in supported shortcut functions
- Need to preserve original operator configuration before each write

## Workstream B: Notification Logic From Schedule/InOut

### Scope

Replace notification classification logic so it uses WiseEye schedule windows instead of depending on raw `I/O` from `CheckInOut.OriginType`.

### Recommended Approach

Treat `OriginType` as fallback only. Primary classification should come from:

- user schedule for the day
- `Schedule.InOutID`
- `InOutArr.InOutMode`
- `InOut.StartIn / EndIn / StartOut / EndOut`

### Why This Approach

- Matches live WiseEye configuration already used by the organization
- Keeps notifications correct even when device UI is locked to a single visible state
- Handles operator mistakes on the device better than raw `I/O`
- Aligns with existing business data instead of inventing new rules in the app

### Current Problem

Current notification flow:

- reads punches from `CheckInOut`
- trusts `OriginType = I/O`
- treats first `I` as check-in
- treats final `I` as missing checkout

This creates false alerts when:

- user presses wrong `In/Out`
- device is configured to hide status selection
- logs are intentionally stored with one fixed status

### New Classification Model

For each user and work date:

1. Resolve that day's schedule and `InOutID`
2. Load `InOutArr` metadata and `InOut` windows
3. Build in/out windows for the day
4. Classify punches by time window, not by `OriginType`
5. Use classified punches to produce:
   - first arrival punch
   - final checkout punch

### Notification Rules

Late:

- Find the first punch that falls into the first `StartIn/EndIn` window
- Compare it to `shift.onduty + lateGraceMinutes`
- If later, emit a `late` notification

Missing checkout:

- Find a punch in the final `StartOut/EndOut` window
- If none exists and `offduty + missingCheckoutGraceMinutes` has passed, emit `missing-checkout`

### Phase 1 Support

Support first:

- `InOutMode = 0` (`Chon gio tu dong - Trong ngay`)
- `InOutMode = 1` (`Theo khoang gio`)

Fallback behavior for unsupported modes:

- stay conservative
- avoid generating aggressive false alerts
- optionally fall back to old logic only when config is unavailable

### Required Code Changes

Repository layer:

- extend notification repository queries to fetch schedule / inout metadata per user/date
- stop using one "today shift" for the entire lookback range

Domain layer:

- add helpers to classify punches by configured time windows
- isolate this logic into small, testable functions

Notification service:

- replace `getFirstCheckIn` and `lastPunch.type === 'I'`
- generate notifications from classified windows instead

### Test Strategy

Add tests that cover:

- late detection when all raw punches are `I`
- missing checkout detection by missing final out window
- no false late when wrong `I/O` exists but time window says otherwise
- stale notification cleanup still works
- per-day schedule resolution rather than "one shift for whole lookback"

## Out Of Scope

- Full app integration of shortcut-key editing UI
- Full support for every WiseEye `InOutMode` in phase 1
- Rewriting all attendance history logic in the same change
- Reverse-engineering raw protocol if SDK/COM is available and sufficient

## Recommended Delivery Order

1. Prototype `SSR_SetShortkey` tool and verify it on the real device
2. Update notification classification to use `Schedule/InOut`
3. If the tool proves stable, wrap it later behind an app-facing service / IPC layer

## Open Questions

- Exact COM/SDK package path and registration status on the target Windows environment
- Exact shortkey layout and labels currently configured on the physical device
- Whether unsupported `InOutMode` values should hard-fail or soft-fallback in phase 1
