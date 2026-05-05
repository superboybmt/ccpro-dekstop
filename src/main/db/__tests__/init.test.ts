import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPoolMock, requestMock, poolMock } = vi.hoisted(() => {
  const request = {
    query: vi.fn()
  }

  const pool = {
    request: vi.fn(() => request)
  }

  return {
    getPoolMock: vi.fn(async () => pool),
    requestMock: request,
    poolMock: pool
  }
})

vi.mock('../sql', () => ({
  getPool: getPoolMock
}))

vi.mock('../../config/app-config', () => ({
  appConfig: {
    sql: {
      appDatabase: 'CCProTest'
    }
  }
}))

import { assertSafeDatabaseName, initializeAppDatabase } from '../init'

describe('assertSafeDatabaseName', () => {
  beforeEach(() => {
    getPoolMock.mockClear()
    poolMock.request.mockClear()
    requestMock.query.mockClear()
    requestMock.query.mockResolvedValue({ recordset: [{ cnt: 1 }] })
  })

  it('accepts alphanumeric database names with underscores', () => {
    expect(assertSafeDatabaseName('CCPro_2026')).toBe('CCPro_2026')
  })

  it('rejects database names that contain SQL control characters', () => {
    expect(() => assertSafeDatabaseName("CCPro']; DROP DATABASE master;--")).toThrow(
      'Invalid database name'
    )
  })

  it('adds device binding schema and seeds the disabled setting', async () => {
    await initializeAppDatabase()

    const executedSql = requestMock.query.mock.calls.map((call) => String(call[0])).join('\n')

    expect(executedSql).toContain("ADD bound_hardware_id NVARCHAR(64) NULL")
    expect(executedSql).toContain("N'device_binding_enabled'")
    expect(executedSql).toContain("N'off'")
  })
})
