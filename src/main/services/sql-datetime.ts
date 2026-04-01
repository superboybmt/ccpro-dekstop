import {
  formatAppDateKey,
  formatAppDateTimeKey,
  parseAppDate,
  parseAppDateTime
} from '@shared/app-time'

export const formatSqlDate = (value: Date): string => formatAppDateKey(value)

export const formatSqlDateTime = (value: Date): string => formatAppDateTimeKey(value)

export const formatSqlStartOfDay = (value: Date): string => `${formatSqlDate(value)} 00:00:00`

export const parseSqlDate = (value: string): Date => parseAppDate(value)

export const parseSqlDateTime = (value: string): Date => parseAppDateTime(value)

export const parseIsoDateTimeAsLocal = (value: string): Date => parseAppDateTime(value)

export const addDays = (value: Date, days: number): Date => {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}
