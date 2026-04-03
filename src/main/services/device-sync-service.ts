import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { formatAppIsoOffset } from '@shared/app-time'
import { appConfig } from '../config/app-config'
import { getPool } from '../db/sql'
import { formatSqlDateTime, formatSqlStartOfDay, parseIsoDateTimeAsLocal, parseSqlDateTime } from './sql-datetime'

export type DeviceSyncStatusType = 'idle' | 'syncing' | 'ok' | 'error'
export type DeviceSyncTrigger = 'background' | 'manual'

export interface DeviceLogRecord {
  uid: number
  userId: string
  timestamp: string
  status: number
  punch: number
}

export interface DeviceWorkerInput {
  deviceIp: string
  devicePort: number
  devicePassword: number
  bootstrapDays: number
  lastLogUid: number | null
  lastLogTime: string | null
  lastDeviceRecordCount: number | null
}

export interface DeviceWorkerResult {
  deviceIp: string
  recordCount: number | null
  deviceTime: string | null
  logs: DeviceLogRecord[]
  warnings: string[]
}

interface DeviceWorkerResponse {
  ok: boolean
  error?: string
  result?: DeviceWorkerResult
}

interface DeviceRealtimeWorkerResponse {
  type: 'ready' | 'batch'
  result: DeviceWorkerResult
}

interface DeviceWorkerLaunchInput {
  isPackaged: boolean
  platform: NodeJS.Platform
  processCwd: string
  processResourcesPath: string
  overrideExecutablePath?: string
}

interface DeviceWorkerLaunch {
  command: string
  args: string[]
}

export interface DeviceSyncPunchDraft {
  userEnrollNumber: number
  userId: string
  uid: number
  timestamp: string
  status: number
  punch: number
}

export interface DeviceSyncStateRecord {
  deviceIp: string
  status: DeviceSyncStatusType
  lastSyncAt: string | null
  lastRunStartedAt: string | null
  lastRunFinishedAt: string | null
  lastImportedCount: number
  lastSkippedCount: number
  lastError: string | null
  lastLogUid: number | null
  lastLogTime: string | null
  lastDeviceRecordCount: number | null
  updatedAt: string | null
}

export interface DeviceSyncRunRecord {
  status: 'ok' | 'error'
  finishedAt: string
  importedCount: number
  skippedCount: number
  warningCount: number
  errorMessage: string | null
  warnings: string[]
}

export interface DeviceSyncRepository {
  getState(): Promise<DeviceSyncStateRecord | null>
  tryStartLeaderRun(args: {
    deviceIp: string
    startedAt: string
    leaseDurationMs: number
    leaderToken: string
  }): Promise<{
    acquired: boolean
    state: DeviceSyncStateRecord
  }>
  heartbeatLeader(args: {
    deviceIp: string
    heartbeatAt: string
    leaderToken: string
  }): Promise<boolean>
  releaseLeader(args: {
    deviceIp: string
    releasedAt: string
    leaderToken: string
  }): Promise<void>
  startRun(args: {
    deviceIp: string
    trigger: DeviceSyncTrigger
    startedAt: string
  }): Promise<number>
  finishRun(runId: number, result: DeviceSyncRunRecord): Promise<void>
  saveState(state: DeviceSyncStateRecord): Promise<void>
  getMappedUsers(userIds: string[]): Promise<Map<string, number>>
  insertPunches(punches: DeviceSyncPunchDraft[]): Promise<{
    importedCount: number
    skippedCount: number
  }>
}

export interface DeviceSyncRealtimeHandlers {
  onBatch(result: DeviceWorkerResult): Promise<void> | void
  onError(error: Error): Promise<void> | void
  onExit(): Promise<void> | void
}

export interface DeviceSyncWorker {
  run(input: DeviceWorkerInput): Promise<DeviceWorkerResult>
  startRealtime(input: DeviceWorkerInput, handlers: DeviceSyncRealtimeHandlers): Promise<void>
  stop(): Promise<void>
}

export interface DeviceSyncStatus {
  status: DeviceSyncStatusType
  deviceIp: string
  lastSyncAt: string | null
  lastRunStartedAt: string | null
  lastRunFinishedAt: string | null
  lastImportedCount: number
  lastSkippedCount: number
  lastError: string | null
}

interface DeviceSyncServiceOptions {
  deviceIp: string
  devicePort?: number
  devicePassword?: number
  bootstrapDays?: number
  pollIntervalMs?: number
  leaderLeaseMs?: number
  runTimeoutMs?: number
}

interface ResolvedDeviceSyncServiceOptions {
  deviceIp: string
  devicePort: number
  devicePassword?: number
  bootstrapDays: number
  pollIntervalMs: number
  leaderLeaseMs: number
  runTimeoutMs: number
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

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

const toWorkerLocalDateTime = (value: string | null): string | null => toSqlLocalDateTime(value)

const compareDeviceLogs = (left: DeviceLogRecord, right: DeviceLogRecord): number => {
  if (left.timestamp !== right.timestamp) {
    return left.timestamp.localeCompare(right.timestamp)
  }

  return left.uid - right.uid
}

const DEVICE_SYNC_BULK_INSERT_BATCH_SIZE = 250

const defaultStatus = (deviceIp: string): DeviceSyncStateRecord => ({
  deviceIp,
  status: 'idle',
  lastSyncAt: null,
  lastRunStartedAt: null,
  lastRunFinishedAt: null,
  lastImportedCount: 0,
  lastSkippedCount: 0,
  lastError: null,
  lastLogUid: null,
  lastLogTime: null,
  lastDeviceRecordCount: null,
  updatedAt: null
})

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

export const resolveOriginType = (punch: number): 'I' | 'O' => {
  // ZKTeco attendance states:
  // 0 Check-In, 1 Check-Out, 2 Break-Out, 3 Break-In, 4 OT-In, 5 OT-Out
  if ([1, 2, 5].includes(punch)) {
    return 'O'
  }

  return 'I'
}

export const resolveDeviceSyncWorkerLaunch = ({
  isPackaged,
  platform,
  processCwd,
  processResourcesPath,
  overrideExecutablePath
}: DeviceWorkerLaunchInput): DeviceWorkerLaunch => {
  if (isPackaged && platform === 'win32') {
    return {
      command: overrideExecutablePath?.trim() || join(processResourcesPath, 'device-sync', 'device-sync-worker.exe'),
      args: []
    }
  }

  return {
    command: platform === 'win32' ? 'python' : 'python3',
    args: [join(processCwd, 'scripts', 'device-sync-worker.py')]
  }
}

export class DeviceSyncService {
  private readonly options: ResolvedDeviceSyncServiceOptions

  private state: DeviceSyncStateRecord

  private hydratePromise: Promise<void> | null = null

  private currentRun: Promise<DeviceSyncStatus> | null = null

  private pollTimer: NodeJS.Timeout | null = null

  private realtimeActive = false

  private started = false

  private readonly leaderToken = randomUUID()

  constructor(
    private readonly repository: DeviceSyncRepository,
    private readonly worker: DeviceSyncWorker,
    options: DeviceSyncServiceOptions,
    private readonly now: () => Date = () => new Date()
  ) {
    this.options = {
      deviceIp: options.deviceIp,
      devicePort: options.devicePort ?? appConfig.deviceSync.port,
      devicePassword: options.devicePassword ?? appConfig.deviceSync.password,
      bootstrapDays: options.bootstrapDays ?? appConfig.deviceSync.bootstrapDays,
      pollIntervalMs: options.pollIntervalMs ?? appConfig.deviceSync.pollIntervalMs,
      leaderLeaseMs:
        options.leaderLeaseMs ?? Math.max((options.pollIntervalMs ?? appConfig.deviceSync.pollIntervalMs) * 3, 120_000),
      runTimeoutMs: options.runTimeoutMs ?? appConfig.deviceSync.runTimeoutMs
    }
    this.state = defaultStatus(this.options.deviceIp)
  }

  async start(ensureAppReady: () => Promise<void>): Promise<void> {
    if (this.started) {
      return
    }

    this.started = true

    void (async () => {
      try {
        await ensureAppReady()
        await this.hydrate()
        await this.runSync('background')
        this.pollTimer = setInterval(() => {
          void this.runBackgroundPoll()
        }, this.options.pollIntervalMs)
      } catch (error) {
        try {
          await this.persistFailure('background', toErrorMessage(error))
        } catch {
          this.state = {
            ...this.state,
            status: 'error',
            lastError: toErrorMessage(error)
          }
        }
      }
    })()
  }

  async stop(): Promise<void> {
    this.started = false
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    await this.stopRealtimeWorker()
    await this.worker.stop()
  }

  async getStatus(): Promise<DeviceSyncStatus> {
    await this.hydrate()
    return this.serializeStatus(this.state)
  }

  retryNow(): Promise<DeviceSyncStatus> {
    if (!this.realtimeActive) {
      return this.runSync('manual')
    }

    return (async () => {
      await this.stopRealtimeWorker()
      return this.runSync('manual')
    })()
  }

  private async runBackgroundPoll(): Promise<void> {
    try {
      if (this.realtimeActive) {
        const heartbeatAt = formatAppIsoOffset(this.now())
        const retained = await this.repository.heartbeatLeader({
          deviceIp: this.options.deviceIp,
          heartbeatAt,
          leaderToken: this.leaderToken
        })

        if (!retained) {
          await this.stopRealtimeWorker(false)
          await this.runSync('background')
        }

        return
      }

      await this.runSync('background')
    } catch {
      // Failure state is already persisted inside runSync.
    }
  }

  private async hydrate(): Promise<void> {
    if (!this.hydratePromise) {
      this.hydratePromise = (async () => {
        const persistedState = await this.repository.getState()
        if (persistedState) {
          this.state = persistedState
        }
      })()
    }

    await this.hydratePromise
  }

  private runSync(trigger: DeviceSyncTrigger): Promise<DeviceSyncStatus> {
    if (this.currentRun) {
      return this.currentRun
    }

    this.currentRun = (async () => {
      try {
        await this.hydrate()
        if (this.realtimeActive) {
          await this.stopRealtimeWorker()
        }

        const startedAt = formatAppIsoOffset(this.now())
        const leaderRun = await this.repository.tryStartLeaderRun({
          deviceIp: this.options.deviceIp,
          startedAt,
          leaseDurationMs: this.options.leaderLeaseMs,
          leaderToken: this.leaderToken
        })
        this.state = leaderRun.state

        if (!leaderRun.acquired) {
          return this.serializeStatus(this.state)
        }

        const previousState = leaderRun.state
        const runId = await this.repository.startRun({
          deviceIp: this.options.deviceIp,
          trigger,
          startedAt
        })

        try {
          const workerResult = await this.runWorkerWithTimeout(this.buildWorkerInput(previousState))
          const syncResult = await this.applyWorkerResult(workerResult, previousState, startedAt)
          const nextState = syncResult.state
          await this.repository.finishRun(runId, {
            status: 'ok',
            finishedAt: nextState.lastRunFinishedAt ?? startedAt,
            importedCount: nextState.lastImportedCount,
            skippedCount: nextState.lastSkippedCount,
            warningCount: syncResult.warnings.length,
            errorMessage: null,
            warnings: syncResult.warnings
          })
          this.state = nextState
          await this.startRealtimeWorker(nextState)

          return this.serializeStatus(nextState)
        } catch (error) {
          const errorMessage = toErrorMessage(error)
          await this.persistFailure(trigger, errorMessage, runId, startedAt)
          throw error
        }
      } finally {
        this.currentRun = null
      }
    })()

    return this.currentRun
  }

  private buildWorkerInput(state: DeviceSyncStateRecord): DeviceWorkerInput {
    return {
      deviceIp: this.options.deviceIp,
      devicePort: this.options.devicePort,
      devicePassword: this.getDevicePassword(),
      bootstrapDays: this.options.bootstrapDays,
      lastLogUid: state.lastLogUid,
      lastLogTime: toWorkerLocalDateTime(state.lastLogTime),
      lastDeviceRecordCount: state.lastDeviceRecordCount
    }
  }

  private async applyWorkerResult(
    workerResult: DeviceWorkerResult,
    previousState: DeviceSyncStateRecord,
    startedAt = formatAppIsoOffset(this.now())
  ): Promise<{
    state: DeviceSyncStateRecord
    warnings: string[]
  }> {
    const sortedLogs = [...workerResult.logs].sort(compareDeviceLogs)
    const uniqueUserIds = Array.from(new Set(sortedLogs.map((log) => log.userId)))
    const mappedUsers =
      uniqueUserIds.length > 0 ? await this.repository.getMappedUsers(uniqueUserIds) : new Map<string, number>()

    const warnings = [...workerResult.warnings]
    let unmappedCount = 0
    const punches: DeviceSyncPunchDraft[] = []

    for (const log of sortedLogs) {
      const userEnrollNumber = mappedUsers.get(log.userId)
      if (!userEnrollNumber) {
        unmappedCount += 1
        warnings.push(`Khong tim thay nhan vien cho user_id=${log.userId}`)
        continue
      }

      punches.push({
        userEnrollNumber,
        userId: log.userId,
        uid: log.uid,
        timestamp: log.timestamp,
        status: log.status,
        punch: log.punch
      })
    }

    const insertResult =
      punches.length > 0
        ? await this.repository.insertPunches(punches)
        : {
            importedCount: 0,
            skippedCount: 0
          }

    const finishedAt = formatAppIsoOffset(this.now())
    const latestLog = sortedLogs.at(-1)
    const skippedCount = insertResult.skippedCount + unmappedCount
    const nextState: DeviceSyncStateRecord = {
      deviceIp: this.options.deviceIp,
      status: 'ok',
      lastSyncAt: finishedAt,
      lastRunStartedAt: startedAt,
      lastRunFinishedAt: finishedAt,
      lastImportedCount: insertResult.importedCount,
      lastSkippedCount: skippedCount,
      lastError: null,
      lastLogUid: latestLog?.uid ?? previousState.lastLogUid,
      lastLogTime: latestLog?.timestamp ?? previousState.lastLogTime,
      lastDeviceRecordCount: workerResult.recordCount ?? previousState.lastDeviceRecordCount,
      updatedAt: finishedAt
    }

    await this.repository.saveState(nextState)
    return {
      state: nextState,
      warnings
    }
  }

  private async startRealtimeWorker(state: DeviceSyncStateRecord): Promise<void> {
    if (!this.started || this.realtimeActive) {
      return
    }

    this.realtimeActive = true

    try {
      await this.worker.startRealtime(this.buildWorkerInput(state), {
        onBatch: async (workerResult) => {
          const syncResult = await this.applyWorkerResult(workerResult, this.state)
          this.state = syncResult.state
        },
        onError: async (error) => {
          await this.stopRealtimeWorker()
          await this.persistFailure('background', toErrorMessage(error))
        },
        onExit: async () => {
          this.realtimeActive = false
        }
      })
    } catch (error) {
      this.realtimeActive = false
      await this.persistFailure('background', toErrorMessage(error))
    }
  }

  private async stopRealtimeWorker(releaseLeader = true): Promise<void> {
    if (!this.realtimeActive) {
      return
    }

    this.realtimeActive = false
    await this.worker.stop()

    if (!releaseLeader) {
      return
    }

    await this.repository.releaseLeader({
      deviceIp: this.options.deviceIp,
      releasedAt: formatAppIsoOffset(this.now()),
      leaderToken: this.leaderToken
    })
  }

  private async runWorkerWithTimeout(input: DeviceWorkerInput): Promise<DeviceWorkerResult> {
    if (this.options.runTimeoutMs <= 0) {
      return this.worker.run(input)
    }

    let timeoutHandle: NodeJS.Timeout | null = null

    try {
      return await Promise.race([
        this.worker.run(input),
        new Promise<DeviceWorkerResult>((_resolve, reject) => {
          timeoutHandle = setTimeout(() => {
            void this.worker.stop().catch(() => undefined)
            reject(new Error(`Device sync worker timed out after ${this.options.runTimeoutMs}ms`))
          }, this.options.runTimeoutMs)
        })
      ])
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
    }
  }

  private async persistFailure(
    trigger: DeviceSyncTrigger,
    errorMessage: string,
    runId?: number,
    startedAt?: string
  ): Promise<void> {
    const finishedAt = formatAppIsoOffset(this.now())
    const nextState: DeviceSyncStateRecord = {
      ...this.state,
      status: 'error',
      lastRunStartedAt: startedAt ?? this.state.lastRunStartedAt,
      lastRunFinishedAt: finishedAt,
      lastImportedCount: 0,
      lastSkippedCount: 0,
      lastError: errorMessage,
      updatedAt: finishedAt
    }

    await this.repository.saveState(nextState)
    if (runId) {
      await this.repository.finishRun(runId, {
        status: 'error',
        finishedAt,
        importedCount: 0,
        skippedCount: 0,
        warningCount: 0,
        errorMessage,
        warnings: []
      })
    }

    if (!this.realtimeActive) {
      await this.repository.releaseLeader({
        deviceIp: this.options.deviceIp,
        releasedAt: finishedAt,
        leaderToken: this.leaderToken
      })
    }

    this.state = nextState
    if (trigger === 'background' && !this.pollTimer && this.started) {
      this.pollTimer = setInterval(() => {
        void this.runBackgroundPoll()
      }, this.options.pollIntervalMs)
    }
  }

  private serializeStatus(state: DeviceSyncStateRecord): DeviceSyncStatus {
    return {
      status: state.status,
      deviceIp: state.deviceIp,
      lastSyncAt: state.lastSyncAt,
      lastRunStartedAt: state.lastRunStartedAt,
      lastRunFinishedAt: state.lastRunFinishedAt,
      lastImportedCount: state.lastImportedCount,
      lastSkippedCount: state.lastSkippedCount,
      lastError: state.lastError
    }
  }

  private getDevicePassword(): number {
    if (typeof this.options.devicePassword === 'number' && Number.isFinite(this.options.devicePassword)) {
      return this.options.devicePassword
    }

    throw new Error('Missing required environment variable: ZK_DEVICE_PASSWORD')
  }
}

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
      result.recordset.map((row) => [String(row.UserEnrollNumber), Number(row.UserEnrollNumber)])
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

export class PythonDeviceSyncWorker implements DeviceSyncWorker {
  private currentChild: ChildProcessWithoutNullStreams | null = null

  private stopRequested = false

  async run(input: DeviceWorkerInput): Promise<DeviceWorkerResult> {
    const { command, args } = this.resolveLaunch('once', input)
    return this.spawnWorker(command, args)
  }

  async startRealtime(input: DeviceWorkerInput, handlers: DeviceSyncRealtimeHandlers): Promise<void> {
    const { command, args } = this.resolveLaunch('daemon', input)

    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })

      this.currentChild = child
      this.stopRequested = false

      let ready = false
      let stderr = ''
      let stdoutBuffer = ''
      let batchQueue = Promise.resolve()

      const handleRealtimePayload = (payload: DeviceRealtimeWorkerResponse): void => {
        if (payload.type === 'ready') {
          ready = true
          resolve()
          return
        }

        batchQueue = batchQueue.then(async () => {
          await handlers.onBatch(payload.result)
        })
      }

      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString()
        const lines = stdoutBuffer.split(/\r?\n/)
        stdoutBuffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) {
            continue
          }

          try {
            handleRealtimePayload(JSON.parse(trimmed) as DeviceRealtimeWorkerResponse)
          } catch (error) {
            void handlers.onError(
              new Error(`Khong parse duoc ket qua realtime tu device sync worker: ${toErrorMessage(error)}`)
            )
          }
        }
      })

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', async (error) => {
        this.currentChild = null
        if (!ready) {
          reject(error)
          return
        }

        await handlers.onError(error)
      })

      child.on('close', async (code) => {
        this.currentChild = null
        await batchQueue.catch(() => undefined)
        await handlers.onExit()

        if (this.stopRequested) {
          return
        }

        if (!ready) {
          reject(new Error(stderr.trim() || `Device sync worker exited with code ${code ?? -1}`))
          return
        }

        await handlers.onError(new Error(stderr.trim() || `Device sync worker exited with code ${code ?? -1}`))
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.currentChild || this.currentChild.killed) {
      return
    }

    this.stopRequested = true
    this.currentChild.kill()
    this.currentChild = null
  }

  private resolveLaunch(mode: 'once' | 'daemon', input: DeviceWorkerInput): DeviceWorkerLaunch {
    const launch = resolveDeviceSyncWorkerLaunch({
      isPackaged: app.isPackaged,
      platform: process.platform,
      processCwd: process.cwd(),
      processResourcesPath: process.resourcesPath,
      overrideExecutablePath: process.env.CCPRO_DEVICE_SYNC_WORKER_PATH
    })
    const payload = JSON.stringify({ mode, input })

    if (app.isPackaged && process.platform === 'win32') {
      if (!existsSync(launch.command)) {
        throw new Error(`Khong tim thay bundled device sync worker: ${launch.command}`)
      }

      return {
        command: launch.command,
        args: [payload]
      }
    }

    if (!existsSync(launch.args[0] ?? '')) {
      throw new Error('Khong tim thay device-sync-worker.py')
    }

    return {
      command: launch.command,
      args: [...launch.args, payload]
    }
  }

  private spawnWorker(command: string, args: string[]): Promise<DeviceWorkerResult> {
    return new Promise<DeviceWorkerResult>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })

      this.currentChild = child
      this.stopRequested = false

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', (error) => {
        this.currentChild = null
        reject(error)
      })

      child.on('close', (code) => {
        this.currentChild = null

        if (!stdout.trim()) {
          reject(new Error(stderr.trim() || `Device sync worker exited with code ${code ?? -1}`))
          return
        }

        let payload: DeviceWorkerResponse
        try {
          payload = JSON.parse(stdout) as DeviceWorkerResponse
        } catch (error) {
          reject(
            new Error(
              `Khong parse duoc ket qua tu device sync worker: ${toErrorMessage(error)}; stdout=${stdout.trim()}`
            )
          )
          return
        }

        if (!payload.ok || !payload.result) {
          reject(new Error(payload.error ?? (stderr.trim() || 'Device sync worker failed')))
          return
        }

        resolve(payload.result)
      })
    })
  }
}
