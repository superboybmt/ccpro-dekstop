const CANONICAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const CANONICAL_MONTH_PATTERN = /^(\d{4})-(\d{2})$/
const DISPLAY_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/
const DISPLAY_MONTH_PATTERN = /^(\d{2})\/(\d{4})$/
const CANONICAL_TIME_PATTERN = /^(\d{2}):(\d{2})$/
const CANONICAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/

const formatTwoDigits = (value: number): string => String(value).padStart(2, '0')

const isValidCalendarDate = (year: number, month: number, day: number): boolean => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12 || day < 1 || day > 31) return false

  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

const isValidTime = (hours: number, minutes: number): boolean => {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return false
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

const isValidMonth = (year: number, month: number): boolean => {
  if (!Number.isInteger(year) || !Number.isInteger(month)) return false
  return year > 0 && month >= 1 && month <= 12
}

export const formatDisplayDate = (value: string | null): string => {
  if (!value) return ''
  const match = value.match(CANONICAL_DATE_PATTERN)
  if (!match) return ''
  const [, year, month, day] = match
  return `${day}/${month}/${year}`
}

export const formatDisplayMonth = (value: string | null): string => {
  if (!value) return ''
  const match = value.match(CANONICAL_MONTH_PATTERN)
  if (!match) return ''
  const [, year, month] = match
  return `${month}/${year}`
}

export const parseDisplayDate = (value: string): string | null => {
  const match = value.trim().match(DISPLAY_DATE_PATTERN)
  if (!match) return null

  const [, dayText, monthText, yearText] = match
  const day = Number(dayText)
  const month = Number(monthText)
  const year = Number(yearText)

  if (!isValidCalendarDate(year, month, day)) return null
  return `${yearText}-${monthText}-${dayText}`
}

export const parseDisplayMonth = (value: string): string | null => {
  const match = value.trim().match(DISPLAY_MONTH_PATTERN)
  if (!match) return null

  const [, monthText, yearText] = match
  const month = Number(monthText)
  const year = Number(yearText)

  if (!isValidMonth(year, month)) return null
  return `${yearText}-${monthText}`
}

export const formatDisplayTime = (value: string | null): string => {
  if (!value) return ''
  const canonical = parseDisplayTime(value)
  return canonical ?? ''
}

export const parseDisplayTime = (value: string): string | null => {
  const match = value.trim().match(CANONICAL_TIME_PATTERN)
  if (!match) return null

  const [, hoursText, minutesText] = match
  const hours = Number(hoursText)
  const minutes = Number(minutesText)

  if (!isValidTime(hours, minutes)) return null
  return `${hoursText}:${minutesText}`
}

export const splitCanonicalDateTime = (
  value: string | null
): { date: string | null; time: string | null } => {
  if (!value) {
    return { date: null, time: null }
  }

  const match = value.match(CANONICAL_DATE_TIME_PATTERN)
  if (!match) {
    return { date: null, time: null }
  }

  const [, year, month, day, hours, minutes] = match
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`
  }
}

export const joinCanonicalDateTime = (date: string | null, time: string | null): string | null => {
  const canonicalDate = date ? parseDisplayDate(formatDisplayDate(date)) : null
  const canonicalTime = time ? parseDisplayTime(time) : null

  if (!canonicalDate || !canonicalTime) {
    return null
  }

  return `${canonicalDate} ${canonicalTime}:00`
}

export const formatDisplayDateTime = (value: string | null): string => {
  const parts = splitCanonicalDateTime(value)
  if (!parts.date || !parts.time) return ''

  return `${formatDisplayDate(parts.date)} ${parts.time}`
}

export const buildTimeOptions = (minuteStep = 5): string[] => {
  const safeStep = Math.max(1, Math.floor(minuteStep))
  const values: string[] = []

  for (let hours = 0; hours < 24; hours += 1) {
    for (let minutes = 0; minutes < 60; minutes += safeStep) {
      values.push(`${formatTwoDigits(hours)}:${formatTwoDigits(minutes)}`)
    }
  }

  return values
}

export const buildMonthOptions = (
  year: number
): Array<{ canonical: string; label: string }> => {
  const values: Array<{ canonical: string; label: string }> = []

  for (let month = 1; month <= 12; month += 1) {
    const monthText = formatTwoDigits(month)
    values.push({
      canonical: `${year}-${monthText}`,
      label: `${monthText}/${year}`
    })
  }

  return values
}

export const getMonthYear = (value: string | null): number => {
  if (value) {
    const canonical = value.match(CANONICAL_MONTH_PATTERN)
    if (canonical) {
      return Number(canonical[1])
    }
  }

  return new Date().getFullYear()
}

export const getCalendarMonth = (value: string | null): { year: number; month: number } => {
  const canonical = value ? parseDisplayDate(formatDisplayDate(value)) : null
  if (canonical) {
    const [yearText, monthText] = canonical.split('-')
    return { year: Number(yearText), month: Number(monthText) }
  }

  const now = new Date()
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1
  }
}

export const buildCalendarDays = (
  year: number,
  month: number
): Array<{ key: string; day: number; canonical: string }> => {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const values: Array<{ key: string; day: number; canonical: string }> = []

  for (let day = 1; day <= daysInMonth; day += 1) {
    values.push({
      key: `${year}-${formatTwoDigits(month)}-${formatTwoDigits(day)}`,
      day,
      canonical: `${year}-${formatTwoDigits(month)}-${formatTwoDigits(day)}`
    })
  }

  return values
}
