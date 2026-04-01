## 1. Data and Policy Setup

- [x] 1.1 Add app DB schema for remote-risk punch audit logs
- [x] 1.2 Define the phase-1 denylist of remote-control tools, risk thresholds, and policy modes

## 2. Remote-Risk Detection

- [x] 2.1 Implement a main-process service that detects denylisted processes on Windows
- [x] 2.2 Implement active-signal checks for network/session/window activity near punch time
- [x] 2.3 Combine signals into `low / medium / high` risk classification with structured output

## 3. Attendance Enforcement

- [x] 3.1 Integrate remote-risk evaluation into `attendance:check-in` and `attendance:check-out` IPC flows
- [x] 3.2 Respect the configured policy mode (`audit_only` or `block_high_risk`) when deciding whether to block punch
- [x] 3.3 Block punch only when policy allows enforcement and risk is `high`, then return a clear error message
- [x] 3.4 Persist audit rows for suspicious and blocked punch attempts

## 4. UI and Feedback

- [x] 4.1 Expose current remote-risk state to the renderer
- [x] 4.2 Expose the configured remote-risk policy mode to the admin UI
- [x] 4.3 Update the Dashboard punch UI to show warnings and blocked-state messaging
- [x] 4.4 Ensure renderer state matches main-process enforcement results

## 5. Verification

- [x] 5.1 Add tests for risk classification and attendance enforcement paths
- [x] 5.2 Verify low-risk scenarios do not block normal employee punch flow
- [x] 5.3 Verify high-risk scenarios block punch and create audit records
