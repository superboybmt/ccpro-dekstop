import bcrypt from 'bcryptjs'
import { appConfig } from '../config/app-config'
import { getPool } from './sql'

export const initializeAppDatabase = async (): Promise<void> => {
  const databaseName = appConfig.sql.appDatabase
  const masterPool = await getPool('master')

  await masterPool.request().query(`
    IF DB_ID(N'${databaseName}') IS NULL
    BEGIN
      CREATE DATABASE [${databaseName}]
    END
  `)

  const appPool = await getPool('app')

  await appPool.request().query(`
    IF OBJECT_ID(N'dbo.app_users', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.app_users (
        user_enroll_number INT NOT NULL PRIMARY KEY,
        employee_code NVARCHAR(20) NOT NULL UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        is_first_login BIT NOT NULL DEFAULT 0,
        is_active_app BIT NOT NULL DEFAULT 1,
        updated_by_admin_id INT NULL,
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

    IF OBJECT_ID(N'dbo.device_sync_state', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.device_sync_state (
        device_ip NVARCHAR(50) NOT NULL PRIMARY KEY,
        last_status NVARCHAR(20) NOT NULL DEFAULT N'idle',
        last_sync_at DATETIME2 NULL,
        last_run_started_at DATETIME2 NULL,
        last_run_finished_at DATETIME2 NULL,
        last_imported_count INT NOT NULL DEFAULT 0,
        last_skipped_count INT NOT NULL DEFAULT 0,
        last_error NVARCHAR(1000) NULL,
        last_log_uid INT NULL,
        last_log_time DATETIME2 NULL,
        last_device_record_count INT NULL,
        leader_token NVARCHAR(100) NULL,
        updated_at DATETIME2 NOT NULL DEFAULT DATEADD(HOUR, 7, SYSUTCDATETIME())
      )
    END

    IF COL_LENGTH(N'dbo.device_sync_state', N'leader_token') IS NULL
    BEGIN
      ALTER TABLE dbo.device_sync_state
      ADD leader_token NVARCHAR(100) NULL
    END

    IF OBJECT_ID(N'dbo.device_sync_runs', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.device_sync_runs (
        id BIGINT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        device_ip NVARCHAR(50) NOT NULL,
        trigger_source NVARCHAR(20) NOT NULL,
        started_at DATETIME2 NOT NULL,
        finished_at DATETIME2 NULL,
        status NVARCHAR(20) NOT NULL,
        imported_count INT NOT NULL DEFAULT 0,
        skipped_count INT NOT NULL DEFAULT 0,
        warning_count INT NOT NULL DEFAULT 0,
        error_message NVARCHAR(1000) NULL,
        warnings_json NVARCHAR(MAX) NULL
      )
    END

    DECLARE @defaultConstraintName SYSNAME

    SELECT @defaultConstraintName = dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
    INNER JOIN sys.objects o ON o.object_id = c.object_id
    WHERE o.schema_id = SCHEMA_ID(N'dbo')
      AND o.name = N'app_users'
      AND c.name = N'created_at'

    IF @defaultConstraintName IS NOT NULL
      EXEC(N'ALTER TABLE dbo.app_users DROP CONSTRAINT [' + @defaultConstraintName + ']')

    IF NOT EXISTS (
      SELECT 1
      FROM sys.default_constraints dc
      INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
      INNER JOIN sys.objects o ON o.object_id = c.object_id
      WHERE o.schema_id = SCHEMA_ID(N'dbo')
        AND o.name = N'app_users'
        AND c.name = N'created_at'
    )
    BEGIN
      ALTER TABLE dbo.app_users
      ADD CONSTRAINT DF_app_users_created_at
      DEFAULT DATEADD(HOUR, 7, SYSUTCDATETIME()) FOR created_at
    END

    SELECT @defaultConstraintName = dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
    INNER JOIN sys.objects o ON o.object_id = c.object_id
    WHERE o.schema_id = SCHEMA_ID(N'dbo')
      AND o.name = N'app_users'
      AND c.name = N'updated_at'

    IF @defaultConstraintName IS NOT NULL
      EXEC(N'ALTER TABLE dbo.app_users DROP CONSTRAINT [' + @defaultConstraintName + ']')

    IF NOT EXISTS (
      SELECT 1
      FROM sys.default_constraints dc
      INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
      INNER JOIN sys.objects o ON o.object_id = c.object_id
      WHERE o.schema_id = SCHEMA_ID(N'dbo')
        AND o.name = N'app_users'
        AND c.name = N'updated_at'
    )
    BEGIN
      ALTER TABLE dbo.app_users
      ADD CONSTRAINT DF_app_users_updated_at
      DEFAULT DATEADD(HOUR, 7, SYSUTCDATETIME()) FOR updated_at
    END

    SELECT @defaultConstraintName = dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
    INNER JOIN sys.objects o ON o.object_id = c.object_id
    WHERE o.schema_id = SCHEMA_ID(N'dbo')
      AND o.name = N'app_notifications'
      AND c.name = N'created_at'

    IF @defaultConstraintName IS NOT NULL
      EXEC(N'ALTER TABLE dbo.app_notifications DROP CONSTRAINT [' + @defaultConstraintName + ']')

    IF NOT EXISTS (
      SELECT 1
      FROM sys.default_constraints dc
      INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
      INNER JOIN sys.objects o ON o.object_id = c.object_id
      WHERE o.schema_id = SCHEMA_ID(N'dbo')
        AND o.name = N'app_notifications'
        AND c.name = N'created_at'
    )
    BEGIN
      ALTER TABLE dbo.app_notifications
      ADD CONSTRAINT DF_app_notifications_created_at
      DEFAULT DATEADD(HOUR, 7, SYSUTCDATETIME()) FOR created_at
    END

    SELECT @defaultConstraintName = dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
    INNER JOIN sys.objects o ON o.object_id = c.object_id
    WHERE o.schema_id = SCHEMA_ID(N'dbo')
      AND o.name = N'device_sync_state'
      AND c.name = N'updated_at'

    IF @defaultConstraintName IS NOT NULL
      EXEC(N'ALTER TABLE dbo.device_sync_state DROP CONSTRAINT [' + @defaultConstraintName + ']')

    IF NOT EXISTS (
      SELECT 1
      FROM sys.default_constraints dc
      INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
      INNER JOIN sys.objects o ON o.object_id = c.object_id
      WHERE o.schema_id = SCHEMA_ID(N'dbo')
        AND o.name = N'device_sync_state'
        AND c.name = N'updated_at'
    )
    BEGIN
      ALTER TABLE dbo.device_sync_state
      ADD CONSTRAINT DF_device_sync_state_updated_at
      DEFAULT DATEADD(HOUR, 7, SYSUTCDATETIME()) FOR updated_at
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

    IF COL_LENGTH(N'dbo.app_admins', N'must_change_password') IS NULL
    BEGIN
      ALTER TABLE dbo.app_admins
      ADD must_change_password BIT NOT NULL CONSTRAINT DF_app_admins_must_change_password DEFAULT 0 WITH VALUES
    END

    IF COL_LENGTH(N'dbo.app_admins', N'password_changed_at') IS NULL
    BEGIN
      ALTER TABLE dbo.app_admins
      ADD password_changed_at DATETIME2 NULL
    END

    IF COL_LENGTH(N'dbo.app_users', N'is_active_app') IS NULL
    BEGIN
      ALTER TABLE dbo.app_users
      ADD is_active_app BIT NOT NULL CONSTRAINT DF_app_users_is_active_app DEFAULT 1 WITH VALUES
    END

    IF COL_LENGTH(N'dbo.app_users', N'updated_by_admin_id') IS NULL
    BEGIN
      ALTER TABLE dbo.app_users
      ADD updated_by_admin_id INT NULL
    END

    IF OBJECT_ID(N'dbo.device_config_audit_logs', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.device_config_audit_logs (
        id BIGINT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        admin_id INT NOT NULL,
        device_ip NVARCHAR(50) NOT NULL,
        action NVARCHAR(50) NOT NULL,
        before_json NVARCHAR(MAX) NULL,
        after_json NVARCHAR(MAX) NULL,
        status NVARCHAR(20) NOT NULL,
        error_message NVARCHAR(1000) NULL,
        created_at DATETIME2 NOT NULL DEFAULT DATEADD(HOUR, 7, SYSUTCDATETIME())
      )
    END

    IF OBJECT_ID(N'dbo.admin_user_audit_logs', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.admin_user_audit_logs (
        id BIGINT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        admin_id INT NOT NULL,
        user_enroll_number INT NOT NULL,
        employee_code NVARCHAR(20) NOT NULL,
        action NVARCHAR(50) NOT NULL,
        before_json NVARCHAR(MAX) NULL,
        after_json NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT DATEADD(HOUR, 7, SYSUTCDATETIME())
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

    IF OBJECT_ID(N'dbo.app_settings', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.app_settings (
        setting_key NVARCHAR(100) NOT NULL PRIMARY KEY,
        setting_value NVARCHAR(500) NOT NULL,
        updated_at DATETIME2 NOT NULL DEFAULT DATEADD(HOUR, 7, SYSUTCDATETIME())
      )
    END

    IF OBJECT_ID(N'dbo.remote_risk_punch_audit_logs', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.remote_risk_punch_audit_logs (
        id BIGINT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        user_enroll_number INT NOT NULL,
        punch_action NVARCHAR(20) NOT NULL,
        risk_level NVARCHAR(20) NOT NULL,
        policy_mode NVARCHAR(30) NOT NULL,
        status NVARCHAR(20) NOT NULL,
        detected_processes_json NVARCHAR(MAX) NOT NULL,
        active_signals_json NVARCHAR(MAX) NOT NULL,
        reason NVARCHAR(500) NULL,
        checked_at DATETIME2 NOT NULL
      )
    END

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'IX_app_notifications_user_created'
    )
    BEGIN
      CREATE INDEX IX_app_notifications_user_created
      ON dbo.app_notifications(user_enroll_number, created_at DESC)
    END

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'IX_device_sync_runs_device_started'
    )
    BEGIN
      CREATE INDEX IX_device_sync_runs_device_started
      ON dbo.device_sync_runs(device_ip, started_at DESC)
    END

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'IX_app_admins_username'
    )
    BEGIN
      CREATE UNIQUE INDEX IX_app_admins_username
      ON dbo.app_admins(username)
    END

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'IX_device_config_audit_logs_admin_created'
    )
    BEGIN
      CREATE INDEX IX_device_config_audit_logs_admin_created
      ON dbo.device_config_audit_logs(admin_id, created_at DESC)
    END

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'IX_admin_user_audit_logs_admin_created'
    )
    BEGIN
      CREATE INDEX IX_admin_user_audit_logs_admin_created
      ON dbo.admin_user_audit_logs(admin_id, created_at DESC)
    END

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'IX_admin_user_audit_logs_user_created'
    )
    BEGIN
      CREATE INDEX IX_admin_user_audit_logs_user_created
      ON dbo.admin_user_audit_logs(user_enroll_number, created_at DESC)
    END

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'IX_admin_auth_audit_logs_target_created'
    )
    BEGIN
      CREATE INDEX IX_admin_auth_audit_logs_target_created
      ON dbo.admin_auth_audit_logs(target_admin_id, created_at DESC)
    END

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'IX_admin_auth_audit_logs_actor_created'
    )
    BEGIN
      CREATE INDEX IX_admin_auth_audit_logs_actor_created
      ON dbo.admin_auth_audit_logs(actor_admin_id, created_at DESC)
    END

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = N'IX_remote_risk_punch_audit_logs_user_checked'
    )
    BEGIN
      CREATE INDEX IX_remote_risk_punch_audit_logs_user_checked
      ON dbo.remote_risk_punch_audit_logs(user_enroll_number, checked_at DESC)
    END

    IF NOT EXISTS (
      SELECT 1
      FROM dbo.app_settings
      WHERE setting_key = N'remote_risk_guard_mode'
    )
    BEGIN
      INSERT INTO dbo.app_settings (
        setting_key,
        setting_value
      )
      VALUES (
        N'remote_risk_guard_mode',
        N'audit_only'
      )
    END
  `)

  await seedDefaultAdmin(appPool)
  await seedDefaultEmployee(appPool)
}

const seedDefaultAdmin = async (pool: Awaited<ReturnType<typeof getPool>>): Promise<void> => {
  const result = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.app_admins')
  const count = result.recordset[0].cnt

  if (count > 0) return

  const defaultPassword = 'ccpro@2026'
  const passwordHash = await bcrypt.hash(defaultPassword, 10)
  const request = pool.request()
  request.input('username', 'admin')
  request.input('passwordHash', passwordHash)
  request.input('displayName', 'Administrator')
  request.input('role', 'admin')

  await request.query(`
    INSERT INTO dbo.app_admins (
      username, password_hash, display_name, role, is_active, must_change_password, password_changed_at
    )
    VALUES (
      @username, @passwordHash, @displayName, @role, 1, 0, DATEADD(HOUR, 7, SYSUTCDATETIME())
    )
  `)

  console.log('[init] Created default admin account: admin / ccpro@2026')
}

const seedDefaultEmployee = async (pool: Awaited<ReturnType<typeof getPool>>): Promise<void> => {
  const result = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.app_users')
  const count = result.recordset[0].cnt

  if (count > 0) return

  const defaultPassword = 'pnj@1234'
  const passwordHash = await bcrypt.hash(defaultPassword, 10)
  const request = pool.request()
  request.input('userEnrollNumber', 1)
  request.input('employeeCode', 'E0000000')
  request.input('passwordHash', passwordHash)

  await request.query(`
    INSERT INTO dbo.app_users (
      user_enroll_number, employee_code, password_hash, is_first_login
    )
    VALUES (
      @userEnrollNumber, @employeeCode, @passwordHash, 1
    )
  `)

  console.log('[init] Created default employee account: E0000000 / pnj@1234')
}
