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

import { SqlDeviceSyncRepository } from '../device-sync-service'

describe('SqlDeviceSyncRepository bulk insert', () => {
  beforeEach(() => {
    getPoolMock.mockClear()
    poolMock.request.mockClear()
    requestMock.input.mockClear()
    requestMock.query.mockClear()
    requestMock.input.mockImplementation(() => requestMock)
    requestMock.query.mockResolvedValue({
      recordset: [{ insertedCount: 2 }]
    })
  })

  it('inserts multiple punches with a single batched query', async () => {
    const repository = new SqlDeviceSyncRepository('10.60.1.5')

    const result = await repository.insertPunches([
      {
        userEnrollNumber: 32,
        userId: '32',
        uid: 123,
        timestamp: '2026-03-24T15:15:00',
        status: 0,
        punch: 0
      },
      {
        userEnrollNumber: 33,
        userId: '33',
        uid: 124,
        timestamp: '2026-03-24T15:16:00',
        status: 0,
        punch: 1
      }
    ])

    expect(poolMock.request).toHaveBeenCalledTimes(1)
    expect(requestMock.query).toHaveBeenCalledTimes(1)
    expect(requestMock.input).toHaveBeenCalledWith('userEnrollNumber0', 32)
    expect(requestMock.input).toHaveBeenCalledWith('userEnrollNumber1', 33)
    expect(String(requestMock.query.mock.calls[0]?.[0] ?? '')).toContain('FROM (VALUES')
    expect(result).toEqual({
      importedCount: 2,
      skippedCount: 0
    })
  })
})
