/**
 * Device Sync Service — Core orchestration logic.
 *
 * Types/interfaces → ./device-sync.types.ts
 * SQL repository   → ./sql-device-sync-repository.ts
 * Python worker    → ./python-device-sync-worker.ts
 *
 * This file re-exports all public symbols so existing consumers
 * (e.g. register-handlers.ts) continue to work without changes.
 */

import { randomUUID } from 'node:crypto'
import { formatAppIsoOffset } from '@shared/app-time'
import { appConfig } from '../config/app-config'
import { formatSqlDateTime, parseIsoDateTimeAsLocal } from './sql-datetime'

import {
  compareDeviceLogs,
  defaultStatus,
  toErrorMessage,
  type DeviceSyncPunchDraft,
  type DeviceSyncRepository,
  type DeviceSyncServiceOptions,
  type DeviceSyncStateRecord,
  type DeviceSyncStatus,
  type DeviceSyncTrigger,
  type DeviceSyncWorker,
  type DeviceWorkerInput,
  type DeviceWorkerResult,
  type ResolvedDeviceSyncServiceOptions
} from './device-sync.types'

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility
// ---------------------------------------------------------------------------
export { SqlDeviceSyncRepository } from './sql-device-sync-repository'
export { PythonDeviceSyncWorker } from './python-device-sync-worker'
export {
  resolveDeviceSyncWorkerLaunch,
  resolveOriginType,
  type DeviceLogRecord,
  type DeviceSyncPunchDraft,
  type DeviceSyncRealtimeHandlers,
  type DeviceSyncRepository,
  type DeviceSyncStateRecord,
  type DeviceSyncStatus,
  type DeviceSyncStatusType,
  type DeviceSyncTrigger,
  type DeviceSyncWorker,
  type DeviceWorkerInput,
  type DeviceWorkerLaunch,
  type DeviceWorkerLaunchInput,
  type DeviceWorkerResponse,
  type DeviceWorkerResult
} from './device-sync.types'

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const toSqlLocalDateTime = (value: string | null): string | null => {
  if (!value) {
    return null
  }

  return formatSqlDateTime(parseIsoDateTimeAsLocal(value))
}

const toWorkerLocalDateTime = (value: string | null): string | null => toSqlLocalDateTime(value)

// ---------------------------------------------------------------------------
// DeviceSyncService
// ---------------------------------------------------------------------------

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
