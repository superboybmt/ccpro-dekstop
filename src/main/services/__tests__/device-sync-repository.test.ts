import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPoolMock, requestMock, poolMock } = vi.hoisted(() => {
  const request = {
    input: vi.fn(),
    query: vi.fn()
  }
  request.input.mockImplementation(() => request)

  const pool = {
    request: vi.fn(() => request)
  }

  return {
    getPoolMock: vi.fn(async () => pool),
    requestMock: request,
    poolMock: pool
  }
})

vi.mock('../../db/sql', () => ({
  getPool: getPoolMock
}))

import { resolveOriginType, SqlDeviceSyncRepository } from '../device-sync-service'

describe('SqlDeviceSyncRepository', () => {
  beforeEach(() => {
    getPoolMock.mockClear()
    poolMock.request.mockClear()
    requestMock.input.mockClear()
    requestMock.query.mockClear()
    requestMock.input.mockImplementation(() => requestMock)
    requestMock.query.mockResolvedValue({
      recordset: [{ insertedCount: 0 }]
    })
  })

  it('uses the CheckInOut primary key columns for duplicate detection', async () => {
    const repository = new SqlDeviceSyncRepository('10.60.1.5')

    await repository.insertPunches([
      {
        userEnrollNumber: 32,
        userId: '32',
        uid: 123,
        timestamp: '2026-03-24T15:38:48.000Z',
        status: 0,
        punch: 0
      }
    ])

    const query = String(requestMock.query.mock.calls[0]?.[0] ?? '')

    expect(query).toContain('ROW_NUMBER() OVER (PARTITION BY UserEnrollNumber, TimeStr')
    expect(query).toContain('WHERE target.UserEnrollNumber = source.UserEnrollNumber')
    expect(query).toContain('AND target.TimeStr = source.TimeStr')
    expect(query).not.toContain('AND target.Source = source.Source')
    expect(query).not.toContain('AND target.MachineNo = source.MachineNo')
  })

  it('preserves the device wall-clock time when punch timestamps include a timezone suffix', async () => {
    const repository = new SqlDeviceSyncRepository('10.60.1.5')

    await repository.insertPunches([
      {
        userEnrollNumber: 32,
        userId: '32',
        uid: 123,
        timestamp: '2026-03-24T15:15:00',
        status: 0,
        punch: 0
      }
    ])

    expect(requestMock.input).toHaveBeenCalledWith('timeStr0', '2026-03-24 15:15:00')
    expect(requestMock.input).toHaveBeenCalledWith('timeDate0', '2026-03-24 00:00:00')
  })

  it('maps ZKTeco attendance states to OriginType consistently', async () => {
    expect(resolveOriginType(0)).toBe('I')
    expect(resolveOriginType(1)).toBe('O')
    expect(resolveOriginType(2)).toBe('O')
    expect(resolveOriginType(3)).toBe('I')
    expect(resolveOriginType(4)).toBe('I')
    expect(resolveOriginType(5)).toBe('O')
  })

  it('converts sync metadata timestamps from UTC instants into app-local SQL datetime strings before writing', async () => {
    const repository = new SqlDeviceSyncRepository('10.60.1.5')

    await repository.startRun({
      deviceIp: '10.60.1.5',
      trigger: 'background',
      startedAt: '2026-03-31T08:15:25.862Z'
    })

    expect(requestMock.input).toHaveBeenCalledWith('startedAt', '2026-03-31 15:15:25')

    requestMock.input.mockClear()

    await repository.finishRun(34, {
      status: 'ok',
      finishedAt: '2026-03-31T08:15:26.089Z',
      importedCount: 0,
      skippedCount: 0,
      warningCount: 0,
      errorMessage: null,
      warnings: []
    })

    expect(requestMock.input).toHaveBeenCalledWith('finishedAt', '2026-03-31 15:15:26')

    requestMock.input.mockClear()

    await repository.saveState({
      deviceIp: '10.60.1.5',
      status: 'ok',
      lastSyncAt: '2026-03-31T08:15:26.089Z',
      lastRunStartedAt: '2026-03-31T08:15:25.862Z',
      lastRunFinishedAt: '2026-03-31T08:15:26.089Z',
      lastImportedCount: 0,
      lastSkippedCount: 0,
      lastError: null,
      lastLogUid: 34,
      lastLogTime: '2026-03-31T08:15:25.000Z',
      lastDeviceRecordCount: 99441,
      updatedAt: '2026-03-31T08:15:26.089Z'
    })

    expect(requestMock.input).toHaveBeenCalledWith('lastSyncAt', '2026-03-31 15:15:26')
    expect(requestMock.input).toHaveBeenCalledWith('lastRunStartedAt', '2026-03-31 15:15:25')
    expect(requestMock.input).toHaveBeenCalledWith('lastRunFinishedAt', '2026-03-31 15:15:26')
    expect(requestMock.input).toHaveBeenCalledWith('lastLogTime', '2026-03-31 15:15:25')
    expect(requestMock.input).toHaveBeenCalledWith('updatedAt', '2026-03-31 15:15:26')
  })

  it('claims the leader lease through a SQL row lock using app-local UTC+7 wall-clock time', async () => {
    requestMock.query.mockResolvedValueOnce({
      recordset: [
        {
          acquired: true,
          deviceIp: '10.60.1.5',
          status: 'syncing',
          lastSyncAt: null,
          lastRunStartedAt: '2026-03-31T15:15:25',
          lastRunFinishedAt: null,
          lastImportedCount: 2,
          lastSkippedCount: 1,
          lastError: null,
          lastLogUid: 45,
          lastLogTime: '2026-03-31T15:14:55',
          lastDeviceRecordCount: 99441,
          updatedAt: '2026-03-31T15:15:25'
        }
      ]
    })

    const repository = new SqlDeviceSyncRepository('10.60.1.5')
    const result = await repository.tryStartLeaderRun({
      deviceIp: '10.60.1.5',
      startedAt: '2026-03-31T08:15:25.862Z',
      leaseDurationMs: 180000,
      leaderToken: 'leader-1'
    } as never)

    expect(requestMock.input).toHaveBeenCalledWith('startedAt', '2026-03-31 15:15:25')
    expect(requestMock.input).toHaveBeenCalledWith('leaseDurationMs', 180000)
    expect(requestMock.input).toHaveBeenCalledWith('leaderToken', 'leader-1')

    const query = String(requestMock.query.mock.calls[0]?.[0] ?? '')
    expect(query).toContain('UPDATE dbo.device_sync_state WITH (UPDLOCK, HOLDLOCK)')
    expect(query).toContain('leader_token = @leaderToken')
    expect(query).toContain("last_status = N'syncing'")
    expect(query).toContain('updated_at < DATEADD(millisecond, -@leaseDurationMs, CONVERT(datetime2, @startedAt, 120))')
    expect(result).toEqual(
      expect.objectContaining({
        acquired: true,
        state: expect.objectContaining({
          status: 'syncing',
          lastRunStartedAt: '2026-03-31T15:15:25+07:00'
        })
      })
    )
  })
})
