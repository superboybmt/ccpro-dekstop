import { describe, expect, it } from 'vitest'
import { HistoryService } from 'e:/ccpro/src/main/services/history-service'
import { parseSqlDateTime } from 'e:/ccpro/src/main/services/sql-datetime'

describe('HistoryService deduplication', () => {
  it('deduplicates punches within 1 minute', async () => {
    const service = new HistoryService({
      getShiftForUser: async () => ({ shiftName: 'A', shiftCode: 'A', onLunch: '12:00', offLunch: '13:00', workingMinutes: 480, onduty: '08:00', offduty: '17:00', lateGraceMinutes: 10, isAbsentSaturday: false, isAbsentSunday: false }),
      getPunchesForRange: async () => [
        { time: parseSqlDateTime('2026-04-06 08:00:00'), type: 'I' },
        { time: parseSqlDateTime('2026-04-06 08:00:30'), type: 'I' }, // duplicate within 1 min
        { time: parseSqlDateTime('2026-04-06 12:00:00'), type: 'O' },
        { time: parseSqlDateTime('2026-04-06 13:00:00'), type: 'I' },
        { time: parseSqlDateTime('2026-04-06 17:00:00'), type: 'O' }
      ]
    })
    
    const res = await service.getHistory(1, { month: '2026-04' })
    expect(res.stats.avgWorkingHoursPerDay).toBe(8)
  })
})
