/**
 * Shared types, interfaces and constants for the Device Sync module.
 *
 * Extracted from device-sync-service.ts for maintainability.
 * Logic is unchanged — only the file location moved.
 */

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

export interface DeviceWorkerResponse {
  ok: boolean
  error?: string
  result?: DeviceWorkerResult
}

export interface DeviceRealtimeWorkerResponse {
  type: 'ready' | 'batch'
  result: DeviceWorkerResult
}

export interface DeviceWorkerLaunchInput {
  isPackaged: boolean
  platform: NodeJS.Platform
  processCwd: string
  processResourcesPath: string
  overrideExecutablePath?: string
}

export interface DeviceWorkerLaunch {
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

export interface DeviceSyncServiceOptions {
  deviceIp: string
  devicePort?: number
  devicePassword?: number
  bootstrapDays?: number
  pollIntervalMs?: number
  leaderLeaseMs?: number
  runTimeoutMs?: number
}

export interface ResolvedDeviceSyncServiceOptions {
  deviceIp: string
  devicePort: number
  devicePassword?: number
  bootstrapDays: number
  pollIntervalMs: number
  leaderLeaseMs: number
  runTimeoutMs: number
}

// ---------------------------------------------------------------------------
// Pure helper functions
// ---------------------------------------------------------------------------

export const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export const compareDeviceLogs = (left: DeviceLogRecord, right: DeviceLogRecord): number => {
  if (left.timestamp !== right.timestamp) {
    return left.timestamp.localeCompare(right.timestamp)
  }

  return left.uid - right.uid
}

export const DEVICE_SYNC_BULK_INSERT_BATCH_SIZE = 250

export const defaultStatus = (deviceIp: string): DeviceSyncStateRecord => ({
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

/**
 * ZKTeco attendance states:
 * 0 Check-In, 1 Check-Out, 2 Break-Out, 3 Break-In, 4 OT-In, 5 OT-Out
 */
export const resolveOriginType = (punch: number): 'I' | 'O' => {
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

// Re-import join for resolveDeviceSyncWorkerLaunch — kept local to avoid
// polluting consumers that don't need node:path.
import { join } from 'node:path'
