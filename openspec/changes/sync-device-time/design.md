## Context

The system uses a standalone Python script compiled to an executable (`machine-config-helper.exe`) to connect to ZKTeco devices via port 4370. This helper relies on the `zk` library (specifically `pyzk`), which communicates using the ZKTeco proprietary UDP/TCP protocol. 

Currently, the helper supports getting and saving machine configurations (auto-switch states, schedules). It lacks a mechanism to sync the device time with the current server time.

## Goals / Non-Goals

**Goals:**
- Implement a one-off command to sync the device's clock to the server's current local time.
- Provide clear UI feedback in the Admin Device Config page on success or failure of the sync operation.

**Non-Goals:**
- Setting custom timezones manually on the device.
- Automatic or scheduled periodic time synchronization (CRON jobs). This is strictly an on-demand, manual operation.

## Decisions

- **Python SDK Extension**: We will add a `sync-time` command to `machine-config-helper.py`. We will use the native `set_time` function of the `zk.ZK` connection object. This approach inherits the existing connection resilience, exception handling, and JSON reporting formats of the helper.
- **Node.js Integration**: The existing `MachineConfigService` interface in `machine-config-service.ts` will receive a new `syncTime(): Promise<MutationResult>` method. This method will execute the helper executable similarly to `get-config` and `save-config`. By having the PC dictate the time, we ensure the time matches exactly with the server where attendance records are processed.
- **UI Location (Option B)**: The Sync Time button will be housed in a new cohesive "Hệ thống" (System) card module below the Auto-Switch settings instead of cluttering the top header. This leaves room for future system-level actions (e.g., Reboot Device, Clear Logs). This card will be placed effectively to minimize accidental clicks.

## Risks / Trade-offs

- **[Risk] Syncing incorrect time due to server drift**: If the server (PC) clock is wrong, it will propagate the wrong time to the attendance machine. 
  - **Mitigation**: Ensure the server uses standard Windows NTP time sync. The admin is manually invoking this, so they hold responsibility.
- **[Risk] Concurrent connections**: The device might reject connections if too many are active.
  - **Mitigation**: The `sync-time` command will instantly connect, set the time, and gracefully disconnect via the `finally` block in Python, exactly as current helper commands do.
