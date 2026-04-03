/**
 * SQL Server implementation of DeviceSyncRepository.
 *
 * Extracted from device-sync-service.ts for maintainability.
 * All SQL queries are unchanged — only the file location moved.
 */

import { formatAppIsoOffset } from '@shared/app-time'
import { appConfig } from '../config/app-config'
import { getPool } from '../db/sql'
import { formatSqlDateTime, formatSqlStartOfDay, parseIsoDateTimeAsLocal, parseSqlDateTime } from './sql-datetime'
import {
  DEVICE_SYNC_BULK_INSERT_BATCH_SIZE,
  defaultStatus,
  resolveOriginType,
  type DeviceSyncPunchDraft,
  type DeviceSyncRepository,
  type DeviceSyncRunRecord,
  type DeviceSyncStateRecord,
  type DeviceSyncStatusType,
  type DeviceSyncTrigger
} from './device-sync.types'

// ---------------------------------------------------------------------------
// Datetime conversion helpers (identical to original)
// ---------------------------------------------------------------------------

const toAppOffsetIso = (value: string | null): string | null => {
  if (!value) {
    return null
  }

  return formatAppIsoOffset(parseSqlDateTime(value))
}

const toSqlLocalDateTime = (value: string | null): string | null => {
  if (!value) {
    return null
  }

  return formatSqlDateTime(parseIsoDateTimeAsLocal(value))
}

const mapStateRow = (row: Record<string, unknown>): DeviceSyncStateRecord => ({
  deviceIp: String(row.deviceIp),
  status: row.status as DeviceSyncStatusType,
  lastSyncAt: toAppOffsetIso((row.lastSyncAt as string | null | undefined) ?? null),
  lastRunStartedAt: toAppOffsetIso((row.lastRunStartedAt as string | null | undefined) ?? null),
  lastRunFinishedAt: toAppOffsetIso((row.lastRunFinishedAt as string | null | undefined) ?? null),
  lastImportedCount: Number(row.lastImportedCount ?? 0),
  lastSkippedCount: Number(row.lastSkippedCount ?? 0),
  lastError: (row.lastError as string | null | undefined) ?? null,
  lastLogUid: row.lastLogUid == null ? null : Number(row.lastLogUid),
  lastLogTime: toAppOffsetIso((row.lastLogTime as string | null | undefined) ?? null),
  lastDeviceRecordCount: row.lastDeviceRecordCount == null ? null : Number(row.lastDeviceRecordCount),
  updatedAt: toAppOffsetIso((row.updatedAt as string | null | undefined) ?? null)
})

// ---------------------------------------------------------------------------
// SqlDeviceSyncRepository
// ---------------------------------------------------------------------------

export class SqlDeviceSyncRepository implements DeviceSyncRepository {
  constructor(private readonly deviceIp = appConfig.deviceSync.ip) {}

  async getState(): Promise<DeviceSyncStateRecord | null> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('deviceIp', this.deviceIp)

    const result = await request.query(`
      SELECT TOP 1
        device_ip AS deviceIp,
        last_status AS status,
        CONVERT(varchar(33), last_sync_at, 127) AS lastSyncAt,
        CONVERT(varchar(33), last_run_started_at, 127) AS lastRunStartedAt,
        CONVERT(varchar(33), last_run_finished_at, 127) AS lastRunFinishedAt,
        last_imported_count AS lastImportedCount,
        last_skipped_count AS lastSkippedCount,
        last_error AS lastError,
        last_log_uid AS lastLogUid,
        CONVERT(varchar(33), last_log_time, 127) AS lastLogTime,
        last_device_record_count AS lastDeviceRecordCount,
        CONVERT(varchar(33), updated_at, 127) AS updatedAt
      FROM dbo.device_sync_state
      WHERE device_ip = @deviceIp
    `)

    const row = result.recordset[0]
    if (!row) {
      return null
    }

    return mapStateRow(row)
  }

  async tryStartLeaderRun(args: {
    deviceIp: string
    startedAt: string
    leaseDurationMs: number
    leaderToken: string
  }): Promise<{
    acquired: boolean
    state: DeviceSyncStateRecord
  }> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('deviceIp', args.deviceIp)
    request.input('startedAt', toSqlLocalDateTime(args.startedAt))
    request.input('leaseDurationMs', args.leaseDurationMs)
    request.input('leaderToken', args.leaderToken)

    const result = await request.query(`
      IF NOT EXISTS (
        SELECT 1
        FROM dbo.device_sync_state
        WHERE device_ip = @deviceIp
      )
      BEGIN
        INSERT INTO dbo.device_sync_state (
          device_ip,
          last_status,
          last_sync_at,
          last_run_started_at,
          last_run_finished_at,
          last_imported_count,
          last_skipped_count,
          last_error,
          last_log_uid,
          last_log_time,
          last_device_record_count,
          leader_token,
          updated_at
        )
        VALUES (
          @deviceIp,
          N'idle',
          NULL,
          NULL,
          NULL,
          0,
          0,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          CONVERT(datetime2, @startedAt, 120)
        )
      END

      DECLARE @claimed TABLE (
        acquired bit NOT NULL,
        deviceIp nvarchar(50) NOT NULL,
        status nvarchar(20) NOT NULL,
        lastSyncAt varchar(33) NULL,
        lastRunStartedAt varchar(33) NULL,
        lastRunFinishedAt varchar(33) NULL,
        lastImportedCount int NOT NULL,
        lastSkippedCount int NOT NULL,
        lastError nvarchar(1000) NULL,
        lastLogUid int NULL,
        lastLogTime varchar(33) NULL,
        lastDeviceRecordCount int NULL,
        leaderToken nvarchar(100) NULL,
        updatedAt varchar(33) NULL
      )

      UPDATE dbo.device_sync_state WITH (UPDLOCK, HOLDLOCK)
      SET
        last_status = N'syncing',
        last_run_started_at = CONVERT(datetime2, @startedAt, 120),
        last_run_finished_at = NULL,
        last_error = NULL,
        leader_token = @leaderToken,
        updated_at = CONVERT(datetime2, @startedAt, 120)
      OUTPUT
        CAST(1 AS bit),
        inserted.device_ip,
        inserted.last_status,
        CONVERT(varchar(33), inserted.last_sync_at, 127),
        CONVERT(varchar(33), inserted.last_run_started_at, 127),
        CONVERT(varchar(33), inserted.last_run_finished_at, 127),
        inserted.last_imported_count,
        inserted.last_skipped_count,
        inserted.last_error,
        inserted.last_log_uid,
        CONVERT(varchar(33), inserted.last_log_time, 127),
        inserted.last_device_record_count,
        inserted.leader_token,
        CONVERT(varchar(33), inserted.updated_at, 127)
      INTO @claimed
      WHERE device_ip = @deviceIp
        AND (
          leader_token = @leaderToken
          OR leader_token IS NULL
          OR updated_at IS NULL
          OR updated_at < DATEADD(millisecond, -@leaseDurationMs, CONVERT(datetime2, @startedAt, 120))
        )

      IF EXISTS (SELECT 1 FROM @claimed)
      BEGIN
        SELECT TOP 1 *
        FROM @claimed
      END
      ELSE
      BEGIN
        SELECT TOP 1
          CAST(0 AS bit) AS acquired,
          device_ip AS deviceIp,
          last_status AS status,
          CONVERT(varchar(33), last_sync_at, 127) AS lastSyncAt,
          CONVERT(varchar(33), last_run_started_at, 127) AS lastRunStartedAt,
          CONVERT(varchar(33), last_run_finished_at, 127) AS lastRunFinishedAt,
          last_imported_count AS lastImportedCount,
          last_skipped_count AS lastSkippedCount,
          last_error AS lastError,
          last_log_uid AS lastLogUid,
          CONVERT(varchar(33), last_log_time, 127) AS lastLogTime,
          last_device_record_count AS lastDeviceRecordCount,
          leader_token AS leaderToken,
          CONVERT(varchar(33), updated_at, 127) AS updatedAt
        FROM dbo.device_sync_state
        WHERE device_ip = @deviceIp
      END
    `)

    const row = result.recordset[0]
    if (!row) {
      return {
        acquired: false,
        state: defaultStatus(args.deviceIp)
      }
    }

    return {
      acquired: Boolean(row.acquired),
      state: mapStateRow(row)
    }
  }

  async heartbeatLeader(args: {
    deviceIp: string
    heartbeatAt: string
    leaderToken: string
  }): Promise<boolean> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('deviceIp', args.deviceIp)
    request.input('heartbeatAt', toSqlLocalDateTime(args.heartbeatAt))
    request.input('leaderToken', args.leaderToken)

    const result = await request.query(`
      UPDATE dbo.device_sync_state
      SET
        updated_at = CONVERT(datetime2, @heartbeatAt, 120)
      WHERE device_ip = @deviceIp
        AND leader_token = @leaderToken;

      SELECT @@ROWCOUNT AS affected;
    `)

    return Number(result.recordset[0]?.affected ?? 0) > 0
  }

  async releaseLeader(args: {
    deviceIp: string
    releasedAt: string
    leaderToken: string
  }): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('deviceIp', args.deviceIp)
    request.input('releasedAt', toSqlLocalDateTime(args.releasedAt))
    request.input('leaderToken', args.leaderToken)

    await request.query(`
      UPDATE dbo.device_sync_state
      SET
        leader_token = NULL,
        updated_at = CONVERT(datetime2, @releasedAt, 120)
      WHERE device_ip = @deviceIp
        AND leader_token = @leaderToken
    `)
  }

  async startRun(args: {
    deviceIp: string
    trigger: DeviceSyncTrigger
    startedAt: string
  }): Promise<number> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('deviceIp', args.deviceIp)
    request.input('trigger', args.trigger)
    request.input('startedAt', toSqlLocalDateTime(args.startedAt))

    const result = await request.query(`
      INSERT INTO dbo.device_sync_runs (
        device_ip,
        trigger_source,
        started_at,
        status,
        imported_count,
        skipped_count,
        warning_count
      )
      VALUES (
        @deviceIp,
        @trigger,
        CONVERT(datetime2, @startedAt, 120),
        N'running',
        0,
        0,
        0
      );

      SELECT CAST(SCOPE_IDENTITY() AS bigint) AS runId;
    `)

    return Number(result.recordset[0]?.runId ?? 0)
  }

  async finishRun(runId: number, result: DeviceSyncRunRecord): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('runId', runId)
    request.input('status', result.status)
    request.input('finishedAt', toSqlLocalDateTime(result.finishedAt))
    request.input('importedCount', result.importedCount)
    request.input('skippedCount', result.skippedCount)
    request.input('warningCount', result.warningCount)
    request.input('errorMessage', result.errorMessage)
    request.input('warnings', JSON.stringify(result.warnings))

    await request.query(`
      UPDATE dbo.device_sync_runs
      SET
        finished_at = CONVERT(datetime2, @finishedAt, 120),
        status = @status,
        imported_count = @importedCount,
        skipped_count = @skippedCount,
        warning_count = @warningCount,
        error_message = @errorMessage,
        warnings_json = @warnings
      WHERE id = @runId
    `)
  }

  async saveState(state: DeviceSyncStateRecord): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('deviceIp', state.deviceIp)
    request.input('status', state.status)
    request.input('lastSyncAt', toSqlLocalDateTime(state.lastSyncAt))
    request.input('lastRunStartedAt', toSqlLocalDateTime(state.lastRunStartedAt))
    request.input('lastRunFinishedAt', toSqlLocalDateTime(state.lastRunFinishedAt))
    request.input('lastImportedCount', state.lastImportedCount)
    request.input('lastSkippedCount', state.lastSkippedCount)
    request.input('lastError', state.lastError)
    request.input('lastLogUid', state.lastLogUid)
    request.input('lastLogTime', toSqlLocalDateTime(state.lastLogTime))
    request.input('lastDeviceRecordCount', state.lastDeviceRecordCount)
    request.input('updatedAt', toSqlLocalDateTime(state.updatedAt ?? this.nowIso()))

    await request.query(`
      MERGE dbo.device_sync_state AS target
      USING (
        SELECT
          @deviceIp AS device_ip
      ) AS source
      ON target.device_ip = source.device_ip
      WHEN MATCHED THEN
        UPDATE SET
          last_status = @status,
          last_sync_at = CASE WHEN @lastSyncAt IS NULL THEN target.last_sync_at ELSE CONVERT(datetime2, @lastSyncAt, 120) END,
          last_run_started_at = CASE WHEN @lastRunStartedAt IS NULL THEN target.last_run_started_at ELSE CONVERT(datetime2, @lastRunStartedAt, 120) END,
          last_run_finished_at = CASE WHEN @lastRunFinishedAt IS NULL THEN target.last_run_finished_at ELSE CONVERT(datetime2, @lastRunFinishedAt, 120) END,
          last_imported_count = @lastImportedCount,
          last_skipped_count = @lastSkippedCount,
          last_error = @lastError,
          last_log_uid = @lastLogUid,
          last_log_time = CASE WHEN @lastLogTime IS NULL THEN target.last_log_time ELSE CONVERT(datetime2, @lastLogTime, 120) END,
          last_device_record_count = @lastDeviceRecordCount,
          updated_at = CONVERT(datetime2, @updatedAt, 120)
      WHEN NOT MATCHED THEN
        INSERT (
          device_ip,
          last_status,
          last_sync_at,
          last_run_started_at,
          last_run_finished_at,
          last_imported_count,
          last_skipped_count,
          last_error,
          last_log_uid,
          last_log_time,
          last_device_record_count,
          updated_at
        )
        VALUES (
          @deviceIp,
          @status,
          CASE WHEN @lastSyncAt IS NULL THEN NULL ELSE CONVERT(datetime2, @lastSyncAt, 120) END,
          CASE WHEN @lastRunStartedAt IS NULL THEN NULL ELSE CONVERT(datetime2, @lastRunStartedAt, 120) END,
          CASE WHEN @lastRunFinishedAt IS NULL THEN NULL ELSE CONVERT(datetime2, @lastRunFinishedAt, 120) END,
          @lastImportedCount,
          @lastSkippedCount,
          @lastError,
          @lastLogUid,
          CASE WHEN @lastLogTime IS NULL THEN NULL ELSE CONVERT(datetime2, @lastLogTime, 120) END,
          @lastDeviceRecordCount,
          CONVERT(datetime2, @updatedAt, 120)
        );
    `)
  }

  async getMappedUsers(userIds: string[]): Promise<Map<string, number>> {
    const numericUserIds = Array.from(
      new Set(
        userIds
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      )
    )

    if (numericUserIds.length === 0) {
      return new Map()
    }

    const pool = await getPool('wise-eye')
    const request = pool.request()

    const placeholders = numericUserIds.map((userId, index) => {
      const name = `user${index}`
      request.input(name, userId)
      return `@${name}`
    })

    const result = await request.query(`
      SELECT UserEnrollNumber
      FROM dbo.UserInfo
      WHERE UserEnrollNumber IN (${placeholders.join(', ')})
    `)

    return new Map(
      result.recordset.map((row: Record<string, unknown>) => [String(row.UserEnrollNumber), Number(row.UserEnrollNumber)])
    )
  }

  async insertPunches(punches: DeviceSyncPunchDraft[]): Promise<{ importedCount: number; skippedCount: number }> {
    if (punches.length === 0) {
      return {
        importedCount: 0,
        skippedCount: 0
      }
    }

    const pool = await getPool('wise-eye')
    let importedCount = 0
    let skippedCount = 0

    for (let batchStart = 0; batchStart < punches.length; batchStart += DEVICE_SYNC_BULK_INSERT_BATCH_SIZE) {
      const batch = punches.slice(batchStart, batchStart + DEVICE_SYNC_BULK_INSERT_BATCH_SIZE)
      const request = pool.request()
      const valuesSql = batch
        .map((punch, index) => {
          const punchTime = parseIsoDateTimeAsLocal(punch.timestamp)
          request.input(`userEnrollNumber${index}`, punch.userEnrollNumber)
          request.input(`timeStr${index}`, formatSqlDateTime(punchTime))
          request.input(`timeDate${index}`, formatSqlStartOfDay(punchTime))
          request.input(`originType${index}`, resolveOriginType(punch.punch))
          request.input(`source${index}`, 'FP')
          request.input(`machineNo${index}`, appConfig.sql.machineNo)
          request.input(`workCode${index}`, 0)

          return `(
            @userEnrollNumber${index},
            CONVERT(datetime, @timeStr${index}, 120),
            CONVERT(smalldatetime, @timeDate${index}, 120),
            @originType${index},
            @source${index},
            @machineNo${index},
            @workCode${index}
          )`
        })
        .join(',\n            ')

      const result = await request.query(`
        DECLARE @inserted TABLE (
          UserEnrollNumber bigint NOT NULL,
          TimeStr datetime NOT NULL
        );

        WITH source AS (
          SELECT
            UserEnrollNumber,
            TimeStr,
            TimeDate,
            OriginType,
            Source,
            MachineNo,
            WorkCode,
            ROW_NUMBER() OVER (PARTITION BY UserEnrollNumber, TimeStr ORDER BY UserEnrollNumber) AS rowNumber
          FROM (VALUES
            ${valuesSql}
          ) AS source_rows (
            UserEnrollNumber,
            TimeStr,
            TimeDate,
            OriginType,
            Source,
            MachineNo,
            WorkCode
          )
        )
        INSERT INTO dbo.CheckInOut (
          UserEnrollNumber,
          TimeStr,
          TimeDate,
          OriginType,
          Source,
          MachineNo,
          WorkCode
        )
        OUTPUT inserted.UserEnrollNumber, inserted.TimeStr INTO @inserted
        SELECT
          source.UserEnrollNumber,
          source.TimeStr,
          source.TimeDate,
          source.OriginType,
          source.Source,
          source.MachineNo,
          source.WorkCode
        FROM source
        WHERE source.rowNumber = 1
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.CheckInOut AS target
            WHERE target.UserEnrollNumber = source.UserEnrollNumber
              AND target.TimeStr = source.TimeStr
          );

        SELECT COUNT(*) AS insertedCount
        FROM @inserted;
      `)

      const insertedCount = Number(result.recordset[0]?.insertedCount ?? 0)
      importedCount += insertedCount
      skippedCount += batch.length - insertedCount
    }

    return {
      importedCount,
      skippedCount
    }
  }

  private nowIso(): string {
    return formatAppIsoOffset(new Date())
  }
}
