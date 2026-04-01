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

import { SqlNotificationRepository, type NotificationDraft } from '../notification-service'

describe('SqlNotificationRepository', () => {
  beforeEach(() => {
    getPoolMock.mockClear()
    poolMock.request.mockClear()
    requestMock.input.mockClear()
    requestMock.query.mockClear()
    requestMock.input.mockImplementation(() => requestMock)
    requestMock.query.mockResolvedValue({
      recordset: []
    })
  })

  it('writes notification timestamps as app-local SQL datetime strings', async () => {
    const repository = new SqlNotificationRepository()

    await repository.reconcileNotifications(1, [
      {
        notificationKey: 'late:1:2026-03-31',
        category: 'late',
        title: 'Đi trễ',
        description: 'Bạn đã đi trễ',
        eventDate: '2026-03-31',
        timestamp: new Date('2026-03-31T08:15:25.000Z')
      } satisfies NotificationDraft
    ])

    expect(requestMock.input).toHaveBeenCalledWith('timestamp0', '2026-03-31 15:15:25')
    expect(String(requestMock.query.mock.calls[0]?.[0] ?? '')).toContain('CONVERT(datetime, created_at, 120) AS created_at')
  })
})
