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

import { SqlAdminShiftRepository } from '../admin-shift-service'

describe('SqlAdminShiftRepository', () => {
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

  it('stores shift times as canonical HH:mm strings instead of converting through datetime', async () => {
    const repository = new SqlAdminShiftRepository()

    await repository.updateShift({
      shiftId: 1,
      onduty: '08:00',
      offduty: '17:00',
      onLunch: '11:30',
      offLunch: null
    })

    expect(requestMock.input).toHaveBeenCalledWith('onduty', '08:00')
    expect(requestMock.input).toHaveBeenCalledWith('offduty', '17:00')
    expect(requestMock.input).toHaveBeenCalledWith('onLunch', '11:30')
    expect(requestMock.input).toHaveBeenCalledWith('offLunch', null)

    const query = String(requestMock.query.mock.calls[0]?.[0] ?? '')
    expect(query).toContain('Onduty = @onduty')
    expect(query).toContain('Offduty = @offduty')
    expect(query).not.toContain('CONVERT(datetime')
  })

  it('normalizes legacy SQL datetime-like strings back into HH:mm for the admin UI', async () => {
    requestMock.query.mockResolvedValueOnce({
      recordset: [
        {
          ShiftID: 1,
          ShiftCode: 'HC',
          ShiftName: 'Ca Hanh Chinh',
          Onduty: 'Jan  1 1900  8:00AM',
          Offduty: 'Jan  1 1900  5:30PM',
          OnLunch: '1900-01-01 11:30:00',
          OffLunch: '13:00'
        }
      ]
    })

    const repository = new SqlAdminShiftRepository()
    const shifts = await repository.listShifts()

    expect(shifts).toEqual([
      {
        shiftId: 1,
        shiftCode: 'HC',
        shiftName: 'Ca Hanh Chinh',
        onduty: '08:00',
        offduty: '17:30',
        onLunch: '11:30',
        offLunch: '13:00'
      }
    ])
  })
})
