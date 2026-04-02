import type { AdminShiftItem, AdminShiftUpdatePayload } from '@shared/api'
import { AdminShiftService, type AdminShiftRepository } from '../admin-shift-service'

const makeShift = (overrides: Partial<AdminShiftItem> = {}): AdminShiftItem => ({
  shiftId: 1,
  shiftCode: 'S001',
  shiftName: 'Ca Hành Chính',
  onduty: '07:30',
  offduty: '17:30',
  onLunch: '11:30',
  offLunch: '13:00',
  ...overrides
})

const createMockRepository = (shifts: AdminShiftItem[] = [makeShift()]): AdminShiftRepository => ({
  listShifts: vi.fn(async () => shifts),
  getShiftById: vi.fn(async (id: number) => shifts.find((s) => s.shiftId === id) ?? null),
  updateShift: vi.fn(async () => undefined),
  writeAuditLog: vi.fn(async () => undefined)
})

describe('AdminShiftService', () => {
  it('lists all shifts', async () => {
    const repository = createMockRepository()
    const service = new AdminShiftService(repository)

    const result = await service.listShifts()

    expect(result.shifts).toHaveLength(1)
    expect(result.shifts[0].shiftName).toBe('Ca Hành Chính')
  })

  it('returns error when shift not found', async () => {
    const repository = createMockRepository([])
    const service = new AdminShiftService(repository)

    const payload: AdminShiftUpdatePayload = {
      shiftId: 999,
      onduty: '08:00',
      offduty: '17:00',
      onLunch: null,
      offLunch: null
    }

    const result = await service.updateShift(payload, 1)

    expect(result.ok).toBe(false)
    expect(result.message).toContain('999')
    expect(repository.updateShift).not.toHaveBeenCalled()
  })

  it('updates shift and writes audit log', async () => {
    const repository = createMockRepository()
    const service = new AdminShiftService(repository)

    const payload: AdminShiftUpdatePayload = {
      shiftId: 1,
      onduty: '08:00',
      offduty: '17:00',
      onLunch: '12:00',
      offLunch: '13:30'
    }

    const result = await service.updateShift(payload, 42)

    expect(result.ok).toBe(true)
    expect(result.message).toContain('Ca Hành Chính')
    expect(repository.updateShift).toHaveBeenCalledWith(payload)
    expect(repository.writeAuditLog).toHaveBeenCalledWith(
      42,
      1,
      { onduty: '07:30', offduty: '17:30', onLunch: '11:30', offLunch: '13:00' },
      { onduty: '08:00', offduty: '17:00', onLunch: '12:00', offLunch: '13:30' }
    )
  })

  it('handles null OnLunch/OffLunch in update payload', async () => {
    const shift = makeShift({ onLunch: '11:30', offLunch: '13:00' })
    const repository = createMockRepository([shift])
    const service = new AdminShiftService(repository)

    const payload: AdminShiftUpdatePayload = {
      shiftId: 1,
      onduty: '07:30',
      offduty: '17:30',
      onLunch: null,
      offLunch: null
    }

    const result = await service.updateShift(payload, 1)

    expect(result.ok).toBe(true)
    expect(repository.writeAuditLog).toHaveBeenCalledWith(
      1,
      1,
      { onduty: '07:30', offduty: '17:30', onLunch: '11:30', offLunch: '13:00' },
      { onduty: '07:30', offduty: '17:30', onLunch: null, offLunch: null }
    )
  })
})
