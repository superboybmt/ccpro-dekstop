## Why

The current desktop attendance system lacks a mechanism to synchronize the physical ZKTeco device's clock with the server/computer clock. Over time, physical devices can experience clock drift, leading to inaccurate check-in/out records. Adding a sync feature directly into the Admin Dashboard ensures HR administrators can quickly correct device time discrepancies without relying on external ZKTeco software or physically interacting with the device menus.

## What Changes

- Add a new `sync-time` command to the Python `machine-config-helper.py` script, leveraging the `zk` library's `set_time` capability.
- Add a corresponding endpoint/action in `machine-config-service.ts` to invoke the helper script for time synchronization.
- Implement a dedicated "Hệ thống" (System Management) Card in the Admin Device Config page (`admin-device-config-page.tsx`) to house the new "Đồng bộ Giờ" (Sync Time) button.
- Create an audit log entry when the time is manually synchronized by an admin.

## Capabilities

### New Capabilities
- `device-time-sync`: The ability to force-synchronize the ZKTeco device's internal clock with the current server/PC time via the Admin Dashboard.

### Modified Capabilities
None

## Impact

- **Admin UI**: Adds a new section to `admin-device-config-page.tsx`.
- **Backend Services**: Extends `machine-config-service.ts` to support the new capability.
- **Python Helper**: Extends `machine-config-helper.py` to accept the new `sync-time` command.
- **Network**: Will trigger a one-off connection to the ZKTeco device over port 4370.
