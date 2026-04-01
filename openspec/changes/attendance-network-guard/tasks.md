## 1. Availability Signal

- [x] 1.1 Decide and expose a renderer-facing signal for current SQL connectivity availability
- [x] 1.2 Ensure the signal is cheap enough to refresh without creating noisy SQL reconnect churn

## 2. Dashboard Guard

- [x] 2.1 Disable the punch button when SQL connectivity is unavailable even if remote-risk is clear
- [x] 2.2 Show a dedicated availability message that tells the user to reconnect to internal LAN / SQL
- [x] 2.3 Keep remote-risk messaging separate so the current blocking reason remains understandable

## 3. Verification

- [x] 3.1 Add renderer tests for unavailable SQL connection causing punch disable
- [ ] 3.2 Verify manually outside internal network that the UI blocks punch before submit
