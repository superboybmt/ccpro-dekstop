import { describe, expect, it } from 'vitest'
import {
  formatAppDateKey,
  formatAppDateTimeKey,
  formatAppIsoOffset,
  formatAppMonthKey,
  formatAppTimeKey,
  getAppDayOfWeek,
  getAppHour,
  parseAppDateTime
} from '../app-time'

describe('app-time', () => {
  it('formats the current month using fixed UTC+7 business time', () => {
    expect(formatAppMonthKey(new Date('2026-03-31T23:30:00.000Z'))).toBe('2026-04')
  })

  it('formats date and time keys using fixed UTC+7 business time', () => {
    const instant = new Date('2026-03-31T08:15:25.000Z')

    expect(formatAppDateKey(instant)).toBe('2026-03-31')
    expect(formatAppTimeKey(instant)).toBe('15:15')
    expect(formatAppDateTimeKey(instant)).toBe('2026-03-31 15:15:25')
    expect(formatAppIsoOffset(instant)).toBe('2026-03-31T15:15:25+07:00')
    expect(getAppHour(instant)).toBe(15)
    expect(getAppDayOfWeek(instant)).toBe(2)
  })

  it('parses naive datetimes as UTC+7 wall-clock values', () => {
    expect(parseAppDateTime('2026-03-31T15:15:25').toISOString()).toBe('2026-03-31T08:15:25.000Z')
  })
})
