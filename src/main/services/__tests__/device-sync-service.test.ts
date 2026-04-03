import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DeviceSyncService,
  resolveDeviceSyncWorkerLaunch,
  type DeviceLogRecord,
  type DeviceSyncRepository,
  type DeviceSyncStateRecord,
  type DeviceSyncWorker,
  type DeviceWorkerResult
} from '../device-sync-service'

const TEST_DEVICE_PASSWORD = 938948

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

const flushAsyncWork = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const createState = (overrides: Partial<DeviceSyncStateRecord> = {}): DeviceSyncStateRecord => ({
  deviceIp: '10.60.1.5',
  status: 'ok',
  lastSyncAt: '2026-03-31T12:00:00+07:00',
  lastRunStartedAt: '2026-03-31T11:59:55+07:00',
  lastRunFinishedAt: '2026-03-31T12:00:00+07:00',
  lastImportedCount: 3,
  lastSkippedCount: 1,
  lastError: null,
  lastLogUid: 45,
  lastLogTime: '2026-03-31T11:59:00',
  lastDeviceRecordCount: 140,
  updatedAt: '2026-03-31T12:00:00+07:00',
  ...overrides
})

const createLog = (overrides: Partial<DeviceLogRecord> = {}): DeviceLogRecord => ({
  uid: 45,
  userId: '45',
  timestamp: '2026-03-31T12:10:00',
  status: 0,
  punch: 0,
  ...overrides
})

const createWorkerResult = (overrides: Partial<DeviceWorkerResult> = {}): DeviceWorkerResult => ({
  deviceIp: '10.60.1.5',
  recordCount: 142,
  deviceTime: '2026-03-31T12:10:05',
  logs: [createLog(), createLog({ uid: 46, timestamp: '2026-03-31T12:11:00' })],
  warnings: [],
  ...overrides
})

const createRepository = (state: DeviceSyncStateRecord | null = null) => {
  const repository: DeviceSyncRepository & {
    heartbeatLeader: ReturnType<typeof vi.fn>
    releaseLeader: ReturnType<typeof vi.fn>
  } = {
    getState: vi.fn(async () => state),
    tryStartLeaderRun: vi.fn(async (args) => ({
      acquired: true,
      runId: 7,
      state: createState({
        ...(state ?? {}),
        status: 'syncing',
        lastRunStartedAt: args.startedAt,
        lastRunFinishedAt: null,
        lastError: null,
        updatedAt: args.startedAt
      })
    })),
    startRun: vi.fn(async () => 7),
    finishRun: vi.fn(async () => undefined),
    saveState: vi.fn(async () => undefined),
    getMappedUsers: vi.fn(async (userIds: string[]) =>
      new Map(userIds.filter((userId) => userId !== '999').map((userId) => [userId, Number(userId)]))
    ),
    insertPunches: vi.fn(async (punches) => ({
      importedCount: punches.length,
      skippedCount: 0
    })),
    heartbeatLeader: vi.fn(async () => true),
    releaseLeader: vi.fn(async () => undefined)
  }

  return repository
}

describe('DeviceSyncService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-31T05:12:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates persisted status and starts background sync after the readiness gate opens', async () => {
    const repository = createRepository(createState())
    const worker: DeviceSyncWorker = {
      run: vi.fn(async () => createWorkerResult({ logs: [] })),
      startRealtime: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    }

    const ready = createDeferred<void>()
    const service = new DeviceSyncService(repository, worker, {
      deviceIp: '10.60.1.5',
      devicePassword: TEST_DEVICE_PASSWORD,
      pollIntervalMs: 60_000
    })

    await service.start(() => ready.promise)

    expect(await service.getStatus()).toEqual(
      expect.objectContaining({
        status: 'ok',
        lastSyncAt: '2026-03-31T12:00:00+07:00',
        lastImportedCount: 3,
        lastSkippedCount: 1
      })
    )
    expect(worker.run).not.toHaveBeenCalled()

    ready.resolve()
    await vi.waitFor(() => {
      expect(worker.run).toHaveBeenCalledTimes(1)
    })
    expect(worker.startRealtime).toHaveBeenCalledTimes(1)
    await service.stop()
  })

  it('keeps manual retry single-flight when a sync is already running', async () => {
    const repository = createRepository(createState())
    const deferred = createDeferred<DeviceWorkerResult>()
    const worker: DeviceSyncWorker = {
      run: vi.fn(() => deferred.promise),
      startRealtime: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    }

    const service = new DeviceSyncService(repository, worker, {
      deviceIp: '10.60.1.5',
      devicePassword: TEST_DEVICE_PASSWORD,
      pollIntervalMs: 60_000
    })

    const firstRun = service.retryNow()
    const secondRun = service.retryNow()
    await flushAsyncWork()

    expect(worker.run).toHaveBeenCalledTimes(1)
    expect(secondRun).toBe(firstRun)
    expect(await service.getStatus()).toEqual(
      expect.objectContaining({
        status: 'syncing'
      })
    )

    deferred.resolve(createWorkerResult({ logs: [] }))
    await firstRun
    await service.stop()
  })

  it('returns the current syncing state when another client already holds the leader lease', async () => {
    const syncingState = createState({
      status: 'syncing',
      lastRunStartedAt: '2026-03-31T12:11:30+07:00',
      lastRunFinishedAt: null
    })
    const repository = createRepository(syncingState)
    repository.tryStartLeaderRun = vi.fn(async () => ({
      acquired: false,
      runId: null,
      state: syncingState
    }))
    const worker: DeviceSyncWorker = {
      run: vi.fn(async () => createWorkerResult()),
      startRealtime: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    }

    const service = new DeviceSyncService(repository, worker, {
      deviceIp: '10.60.1.5',
      devicePassword: TEST_DEVICE_PASSWORD,
      pollIntervalMs: 60_000
    })

    const status = await service.retryNow()

    expect(repository.tryStartLeaderRun).toHaveBeenCalledTimes(1)
    expect(worker.run).not.toHaveBeenCalled()
    expect(repository.finishRun).not.toHaveBeenCalled()
    expect(status).toEqual(
      expect.objectContaining({
        status: 'syncing',
        lastRunStartedAt: '2026-03-31T12:11:30+07:00',
        lastRunFinishedAt: null
      })
    )
    await service.stop()
  })

  it('persists counts, cursor, and unmapped-user warnings after a successful sync', async () => {
    const repository = createRepository(createState())
    repository.insertPunches = vi.fn(async () => ({
      importedCount: 1,
      skippedCount: 1
    }))

    const worker: DeviceSyncWorker = {
      run: vi.fn(async () =>
        createWorkerResult({
          recordCount: 145,
          logs: [
            createLog({ uid: 45, userId: '45', timestamp: '2026-03-31T12:10:00' }),
            createLog({ uid: 47, userId: '999', timestamp: '2026-03-31T12:11:00' }),
            createLog({ uid: 48, userId: '45', timestamp: '2026-03-31T12:12:00' })
          ]
        })
      ),
      startRealtime: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    }

    const service = new DeviceSyncService(repository, worker, {
      deviceIp: '10.60.1.5',
      devicePassword: TEST_DEVICE_PASSWORD,
      pollIntervalMs: 60_000
    })

    await service.retryNow()

    expect(repository.getMappedUsers).toHaveBeenCalledWith(['45', '999'])
    expect(repository.insertPunches).toHaveBeenCalledWith([
      expect.objectContaining({
        userEnrollNumber: 45,
        userId: '45',
        uid: 45
      }),
      expect.objectContaining({
        userEnrollNumber: 45,
        userId: '45',
        uid: 48
      })
    ])
    expect(repository.saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        lastSyncAt: '2026-03-31T12:12:00+07:00',
        lastImportedCount: 1,
        lastSkippedCount: 2,
        lastError: null,
        lastLogUid: 48,
        lastLogTime: '2026-03-31T12:12:00',
        lastDeviceRecordCount: 145
      })
    )
    expect(repository.finishRun).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        status: 'ok',
        importedCount: 1,
        skippedCount: 2,
        warningCount: 1
      })
    )
    expect(await service.getStatus()).toEqual(
      expect.objectContaining({
        status: 'ok',
        lastImportedCount: 1,
        lastSkippedCount: 2,
        lastError: null
      })
    )
    await service.stop()
  })

  it('passes lastLogTime to the worker as a timezone-naive wall-clock timestamp', async () => {
    const repository = createRepository(
      createState({
        lastLogTime: '2026-03-31T12:34:56+07:00'
      })
    )
    const worker: DeviceSyncWorker = {
      run: vi.fn(async () => createWorkerResult({ logs: [] })),
      startRealtime: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    }

    const service = new DeviceSyncService(repository, worker, {
      deviceIp: '10.60.1.5',
      devicePassword: TEST_DEVICE_PASSWORD,
      pollIntervalMs: 60_000
    })

    await service.retryNow()

    expect(worker.run).toHaveBeenCalledWith(
      expect.objectContaining({
        lastLogTime: '2026-03-31 12:34:56'
      })
    )
    await service.stop()
  })

  it('times out a stuck worker run and records an error instead of staying syncing forever', async () => {
    const repository = createRepository(createState())
    const deferred = createDeferred<DeviceWorkerResult>()
    const worker: DeviceSyncWorker = {
      run: vi.fn(() => deferred.promise),
      startRealtime: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    }

    const service = new DeviceSyncService(repository, worker, {
      deviceIp: '10.60.1.5',
      devicePassword: TEST_DEVICE_PASSWORD,
      pollIntervalMs: 60_000,
      runTimeoutMs: 2_000
    })

    const promise = service.retryNow()
    const settled = promise.then(
      () => null,
      (error) => error
    )
    await vi.advanceTimersByTimeAsync(2_000)

    const error = await settled
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('Device sync worker timed out after 2000ms')
    expect(worker.stop).toHaveBeenCalledTimes(1)
    expect(repository.finishRun).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        status: 'error',
        errorMessage: 'Device sync worker timed out after 2000ms'
      })
    )
    expect(await service.getStatus()).toEqual(
      expect.objectContaining({
        status: 'error',
        lastError: 'Device sync worker timed out after 2000ms'
      })
    )
    await service.stop()
  })

  it('prefers bundled worker executable in packaged Windows builds', () => {
    const launch = resolveDeviceSyncWorkerLaunch({
      isPackaged: true,
      platform: 'win32',
      processCwd: 'E:\\ccpro',
      processResourcesPath: 'E:\\ccpro\\release\\win-unpacked\\resources'
    })

    expect(launch).toEqual({
      command: 'E:\\ccpro\\release\\win-unpacked\\resources\\device-sync\\device-sync-worker.exe',
      args: []
    })
  })

  it('prefers a staged AppData worker executable over the packaged resources path', () => {
    const launch = resolveDeviceSyncWorkerLaunch({
      isPackaged: true,
      platform: 'win32',
      processCwd: 'E:\\ccpro',
      processResourcesPath: 'E:\\ccpro\\release\\win-unpacked\\resources',
      overrideExecutablePath: 'C:\\Users\\tester\\AppData\\Roaming\\ccpro-desktop\\runtime\\1.0.3\\device-sync\\device-sync-worker.exe'
    })

    expect(launch).toEqual({
      command: 'C:\\Users\\tester\\AppData\\Roaming\\ccpro-desktop\\runtime\\1.0.3\\device-sync\\device-sync-worker.exe',
      args: []
    })
  })

  it('falls back to script-based worker in development', () => {
    const launch = resolveDeviceSyncWorkerLaunch({
      isPackaged: false,
      platform: 'win32',
      processCwd: 'E:\\ccpro',
      processResourcesPath: 'E:\\ccpro\\release\\win-unpacked\\resources'
    })

    expect(launch).toEqual({
      command: 'python',
      args: ['E:\\ccpro\\scripts\\device-sync-worker.py']
    })
  })

  it('uses heartbeat polling while the realtime worker is active instead of re-running a full scan', async () => {
    const repository = createRepository(createState())
    const worker: DeviceSyncWorker = {
      run: vi
        .fn()
        .mockResolvedValueOnce(createWorkerResult({ logs: [] })),
      startRealtime: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    }

    const ready = createDeferred<void>()
    const service = new DeviceSyncService(repository, worker, {
      deviceIp: '10.60.1.5',
      devicePassword: TEST_DEVICE_PASSWORD,
      pollIntervalMs: 60_000
    })

    await service.start(() => ready.promise)
    ready.resolve()
    await vi.waitFor(() => {
      expect(worker.run).toHaveBeenCalledTimes(1)
    })

    await vi.advanceTimersByTimeAsync(60_000)
    await vi.waitFor(() => {
      expect(repository.heartbeatLeader).toHaveBeenCalledTimes(1)
    })
    expect(worker.run).toHaveBeenCalledTimes(1)
    expect(await service.getStatus()).toEqual(
      expect.objectContaining({
        status: 'ok',
        lastError: null
      })
    )
    await service.stop()
  })

  it('starts a realtime worker after a successful leader sync and seeds it with the latest cursor', async () => {
    const repository = createRepository(createState())
    const worker: DeviceSyncWorker = {
      run: vi.fn(async () =>
        createWorkerResult({
          recordCount: 145,
          logs: [createLog({ uid: 48, userId: '45', timestamp: '2026-03-31T12:12:00' })]
        })
      ),
      startRealtime: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    }

    const ready = createDeferred<void>()
    const service = new DeviceSyncService(repository, worker, {
      deviceIp: '10.60.1.5',
      devicePassword: TEST_DEVICE_PASSWORD,
      pollIntervalMs: 60_000
    })

    await service.start(() => ready.promise)
    ready.resolve()

    await vi.waitFor(() => {
      expect(worker.startRealtime).toHaveBeenCalledTimes(1)
    })

    expect(worker.startRealtime).toHaveBeenCalledWith(
      expect.objectContaining({
        lastLogUid: 48,
        lastLogTime: '2026-03-31 12:12:00',
        lastDeviceRecordCount: 145
      }),
      expect.any(Object)
    )
    await service.stop()
  })
})
