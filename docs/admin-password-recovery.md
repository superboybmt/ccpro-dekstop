# Admin Password Recovery

Use this only for break-glass recovery when no admin can log in.

Command:

```bash
npm run admin:reset-password -- --username admin --temporary-password Temp@123
```

Behavior:

- updates the target admin password
- forces `must_change_password = 1`
- writes an `emergency-reset-password` audit log

Notes:

- run this on the same machine/environment that can reach the app database
- after login, the recovered admin is redirected to change password before other admin actions
