import sql from 'mssql'

const requireEnvironmentVariable = (name, value) => {
  if ((value ?? '').trim().length > 0) {
    return value
  }

  throw new Error(`Missing required environment variable: ${name}`)
}

const validateDatabaseName = (name) => {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error('Invalid CCPRO_APP_DATABASE. Use only letters, numbers, and underscores.')
  }

  return name
}

const databaseName = process.env.CCPRO_APP_DATABASE ?? 'CCPro'
const validatedDatabaseName = validateDatabaseName(databaseName)

const config = {
  user: process.env.WISEEYE_SQL_USER ?? 'sa',
  password: requireEnvironmentVariable('WISEEYE_SQL_PASSWORD', process.env.WISEEYE_SQL_PASSWORD ?? ''),
  server: process.env.WISEEYE_SQL_SERVER ?? '10.60.1.4',
  port: Number(process.env.WISEEYE_SQL_PORT ?? 1433),
  options: {
    encrypt: false,
    trustServerCertificate: true
  },
  connectionTimeout: 10000,
  requestTimeout: 15000
}

const masterPool = await sql.connect({
  ...config,
  database: 'master'
})

await masterPool.request().query(`
  IF DB_ID(N'${validatedDatabaseName}') IS NULL
  BEGIN
    CREATE DATABASE [${validatedDatabaseName}]
  END
`)

await masterPool.close()

const appPool = await sql.connect({
  ...config,
  database: validatedDatabaseName
})

await appPool.request().query(`
  IF OBJECT_ID(N'dbo.app_users', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.app_users (
      user_enroll_number INT NOT NULL PRIMARY KEY,
      employee_code NVARCHAR(20) NOT NULL UNIQUE,
      password_hash NVARCHAR(255) NOT NULL,
      is_first_login BIT NOT NULL DEFAULT 0,
      password_changed_at DATETIME2 NULL,
      created_at DATETIME2 NOT NULL DEFAULT DATEADD(HOUR, 7, SYSUTCDATETIME()),
      updated_at DATETIME2 NOT NULL DEFAULT DATEADD(HOUR, 7, SYSUTCDATETIME())
    )
  END

  IF OBJECT_ID(N'dbo.app_notifications', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.app_notifications (
      id BIGINT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
      user_enroll_number INT NOT NULL,
      notification_key NVARCHAR(120) NOT NULL UNIQUE,
      category NVARCHAR(50) NOT NULL,
      title NVARCHAR(150) NOT NULL,
      description NVARCHAR(500) NOT NULL,
      is_read BIT NOT NULL DEFAULT 0,
      event_date DATE NULL,
      created_at DATETIME2 NOT NULL DEFAULT DATEADD(HOUR, 7, SYSUTCDATETIME()),
      read_at DATETIME2 NULL
    )
  END

  IF OBJECT_ID(N'dbo.app_admins', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.app_admins (
      id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
      username NVARCHAR(50) NOT NULL UNIQUE,
      password_hash NVARCHAR(255) NOT NULL,
      display_name NVARCHAR(100) NOT NULL,
      role NVARCHAR(30) NOT NULL DEFAULT N'admin',
      is_active BIT NOT NULL DEFAULT 1,
      must_change_password BIT NOT NULL DEFAULT 0,
      last_login_at DATETIME2 NULL,
      password_changed_at DATETIME2 NULL,
      created_at DATETIME2 NOT NULL DEFAULT DATEADD(HOUR, 7, SYSUTCDATETIME()),
      updated_at DATETIME2 NOT NULL DEFAULT DATEADD(HOUR, 7, SYSUTCDATETIME())
    )
  END

  IF OBJECT_ID(N'dbo.admin_auth_audit_logs', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.admin_auth_audit_logs (
      id BIGINT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
      actor_admin_id INT NULL,
      target_admin_id INT NOT NULL,
      action NVARCHAR(50) NOT NULL,
      status NVARCHAR(20) NOT NULL,
      metadata_json NVARCHAR(MAX) NULL,
      created_at DATETIME2 NOT NULL DEFAULT DATEADD(HOUR, 7, SYSUTCDATETIME())
    )
  END
`)

await appPool.close()

console.log(`Initialized database ${validatedDatabaseName}`)
