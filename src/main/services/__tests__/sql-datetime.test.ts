import { describe, expect, it } from 'vitest'
import {
  formatSqlDate,
  formatSqlDateTime,
  formatSqlStartOfDay,
  parseIsoDateTimeAsLocal,
  parseSqlDate,
  parseSqlDateTime
} from '../sql-datetime'

describe('sql-datetime', () => {
  it('formats local dates for SQL date columns', () => {
    expect(formatSqlDate(new Date(2026, 2, 31, 7, 23, 12))).toBe('2026-03-31')
  })

  it('formats local datetimes for SQL datetime columns', () => {
    expect(formatSqlDateTime(new Date(2026, 2, 31, 7, 23, 12))).toBe('2026-03-31 07:23:12')
  })

  it('formats UTC instants into app-local UTC+7 wall-clock time', () => {
    expect(formatSqlDateTime(new Date('2026-03-31T08:15:25.862Z'))).toBe('2026-03-31 15:15:25')
  })

  it('formats start of day for SQL smalldatetime columns', () => {
    expect(formatSqlStartOfDay(new Date(2026, 2, 31, 7, 23, 12))).toBe('2026-03-31 00:00:00')
  })

  it('parses SQL date strings without shifting the work date', () => {
    const parsed = parseSqlDate('2026-03-31')

    expect(parsed.toISOString()).toBe('2026-03-30T17:00:00.000Z')
  })

  it('parses SQL datetime strings as local wall-clock time', () => {
    const parsed = parseSqlDateTime('2026-03-31 07:23:12')

    expect(parsed.toISOString()).toBe('2026-03-31T00:23:12.000Z')
  })

  it('parses ISO datetimes with timezone suffix as real instants', () => {
    const fromUtc = parseIsoDateTimeAsLocal('2026-03-31T08:15:00.000Z')
    const fromOffset = parseIsoDateTimeAsLocal('2026-03-31T15:15:00+07:00')

    expect(fromUtc.toISOString()).toBe('2026-03-31T08:15:00.000Z')
    expect(fromOffset.toISOString()).toBe('2026-03-31T08:15:00.000Z')
  })

  it('parses naive ISO datetimes as app-local UTC+7 wall-clock time', () => {
    const parsed = parseIsoDateTimeAsLocal('2026-03-31T15:15:00')

    expect(parsed.toISOString()).toBe('2026-03-31T08:15:00.000Z')
  })
})
