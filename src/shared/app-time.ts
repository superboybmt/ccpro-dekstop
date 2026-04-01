const APP_UTC_OFFSET_MS = 7 * 60 * 60 * 1000
const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,7})?)?)?(?:Z|[+-]\d{2}:\d{2})?$/
const HAS_TIMEZONE_SUFFIX = /(Z|[+-]\d{2}:\d{2})$/

const pad = (value: number): string => String(value).padStart(2, '0')

const shiftToAppClock = (value: Date): Date => new Date(value.getTime() + APP_UTC_OFFSET_MS)

export const createAppDateTime = (
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0
): Date => new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds) - APP_UTC_OFFSET_MS)

export const formatAppDateKey = (value: Date): string => {
  const shifted = shiftToAppClock(value)
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

export const formatAppMonthKey = (value: Date): string => formatAppDateKey(value).slice(0, 7)

export const formatAppTimeKey = (value: Date): string => {
  const shifted = shiftToAppClock(value)
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
}

export const formatAppDateTimeKey = (value: Date): string => {
  const shifted = shiftToAppClock(value)
  return `${formatAppDateKey(value)} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`
}

export const formatAppIsoOffset = (value: Date): string => {
  const shifted = shiftToAppClock(value)
  return `${formatAppDateKey(value)}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}+07:00`
}

export const getAppHour = (value: Date): number => shiftToAppClock(value).getUTCHours()

export const getAppDayOfWeek = (value: Date): number => shiftToAppClock(value).getUTCDay()

export const parseAppDateTime = (value: string): Date => {
  const normalized = value.trim()
  if (HAS_TIMEZONE_SUFFIX.test(normalized)) {
    return new Date(normalized)
  }

  const match = normalized.match(DATE_TIME_PATTERN)
  if (!match) {
    throw new Error(`Invalid app datetime: ${value}`)
  }

  const [, year, month, day, hours = '0', minutes = '0', seconds = '0'] = match
  return createAppDateTime(
    Number(year),
    Number(month),
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds)
  )
}

export const parseAppDate = (value: string): Date => {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    throw new Error(`Invalid app date: ${value}`)
  }

  const [, year, month, day] = match
  return createAppDateTime(Number(year), Number(month), Number(day))
}
