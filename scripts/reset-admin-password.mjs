import 'dotenv/config'
import bcrypt from 'bcryptjs'
import sql from 'mssql'

const requireEnvironmentVariable = (name, value) => {
  if ((value ?? '').trim().length > 0) {
    return value
  }

  throw new Error(`Missing required environment variable: ${name}`)
}

const parseArgs = (argv) => {
  const parsed = {
    username: '',
    temporaryPassword: ''
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const value = argv[index + 1]

    if (token === '--username') {
      parsed.username = value ?? ''
      index += 1
      continue
    }

    if (token === '--temporary-password') {
      parsed.temporaryPassword = value ?? ''
      index += 1
    }
  }

  return parsed
}

const usage = () => {
  console.error('Usage: node scripts/reset-admin-password.mjs --username <username> --temporary-password <password>')
}

const { username, temporaryPassword } = parseArgs(process.argv.slice(2))

if (!username || !temporaryPassword) {
  usage()
  process.exit(1)
}

if (temporaryPassword.length < 6) {
  console.error('Temporary password must be at least 6 characters.')
  process.exit(1)
}

const config = {
  user: process.env.WISEEYE_SQL_USER ?? 'sa',
  password: requireEnvironmentVariable('WISEEYE_SQL_PASSWORD', process.env.WISEEYE_SQL_PASSWORD ?? ''),
  server: process.env.WISEEYE_SQL_SERVER ?? '10.60.1.4',
  port: Number(process.env.WISEEYE_SQL_PORT ?? 1433),
  database: process.env.CCPRO_APP_DATABASE ?? 'CCPro',
  options: {
    encrypt: false,
    trustServerCertificate: true
  },
  connectionTimeout: 10000,
  requestTimeout: 15000
}

const pool = await sql.connect(config)

try {
  const normalizedUsername = username.trim().toLowerCase()
  const lookup = await pool.request()
    .input('username', normalizedUsername)
    .query(`
      SELECT TOP 1 id, username
      FROM dbo.app_admins
      WHERE username = @username
    `)

  const admin = lookup.recordset[0]
  if (!admin) {
    console.error(`Admin '${normalizedUsername}' not found.`)
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(temporaryPassword, 10)

  await pool.request()
    .input('adminId', admin.id)
    .input('passwordHash', passwordHash)
    .input('action', 'emergency-reset-password')
    .query(`
      UPDATE dbo.app_admins
      SET password_hash = @passwordHash,
          must_change_password = 1,
          password_changed_at = DATEADD(HOUR, 7, SYSUTCDATETIME()),
          updated_at = DATEADD(HOUR, 7, SYSUTCDATETIME())
      WHERE id = @adminId;

      INSERT INTO dbo.admin_auth_audit_logs (
        actor_admin_id,
        target_admin_id,
        action,
        status,
        metadata_json,
        created_at
      )
      VALUES (
        NULL,
        @adminId,
        @action,
        N'success',
        N'{"source":"local-maintenance-script"}',
        DATEADD(HOUR, 7, SYSUTCDATETIME())
      );
    `)

  console.log(`Temporary password set for admin '${normalizedUsername}'. They must change it on next login.`)
} finally {
  await pool.close()
}
