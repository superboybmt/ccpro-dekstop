import { describe, expect, it } from 'vitest'
import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatDisplayMonth,
  formatDisplayTime,
  joinCanonicalDateTime,
  parseDisplayDate,
  parseDisplayMonth,
  parseDisplayTime,
  splitCanonicalDateTime
} from '../temporal-input'

describe('temporal-input helpers', () => {
  it('formats canonical values into VN display strings', () => {
    expect(formatDisplayDate('2026-04-02')).toBe('02/04/2026')
    expect(formatDisplayMonth('2026-04')).toBe('04/2026')
    expect(formatDisplayTime('07:30')).toBe('07:30')
    expect(formatDisplayDateTime('2026-04-02 07:30:00')).toBe('02/04/2026 07:30')
  })

  it('parses display strings back into canonical values', () => {
    expect(parseDisplayDate('02/04/2026')).toBe('2026-04-02')
    expect(parseDisplayMonth('04/2026')).toBe('2026-04')
    expect(parseDisplayTime('07:32')).toBe('07:32')
  })

  it('rejects invalid values without auto-correcting them', () => {
    expect(parseDisplayDate('31/02/2026')).toBeNull()
    expect(parseDisplayDate('2/04/2026')).toBeNull()
    expect(parseDisplayMonth('13/2026')).toBeNull()
    expect(parseDisplayMonth('4/2026')).toBeNull()
    expect(parseDisplayTime('24:00')).toBeNull()
    expect(parseDisplayTime('07:3')).toBeNull()
  })

  it('splits and joins canonical datetime values', () => {
    expect(splitCanonicalDateTime('2026-04-02 07:30:00')).toEqual({
      date: '2026-04-02',
      time: '07:30'
    })
    expect(joinCanonicalDateTime('2026-04-02', '07:30')).toBe('2026-04-02 07:30:00')
    expect(joinCanonicalDateTime(null, '07:30')).toBeNull()
    expect(joinCanonicalDateTime('2026-04-02', null)).toBeNull()
  })
})
