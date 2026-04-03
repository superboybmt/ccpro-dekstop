import { formatAppTimeKey } from '@shared/app-time'
import type { ShiftRecord } from './attendance-service'

export interface NotificationInOutWindow {
  startIn: string | null
  endIn: string | null
  startOut: string | null
  endOut: string | null
}

export interface NotificationWindowConfig {
  inOutMode: number | null
  shift: Pick<ShiftRecord, 'onduty' | 'offduty' | 'onLunch' | 'offLunch' | 'lateGraceMinutes'> | null
  windows: NotificationInOutWindow[]
}

export interface NotificationPunchLike {
  time: Date
  type: 'I' | 'O' | null
}

export interface NotificationPunchClassification<TPunch extends NotificationPunchLike> {
  strategy: 'window' | 'raw'
  firstArrivalPunch: TPunch | null
  finalCheckoutPunch: TPunch | null
}

const DAY_START_MINUTES = 0
const DAY_END_MINUTES = 23 * 60 + 59

const timeToMinutes = (value: string | null | undefined): number | null => {
  if (!value || value === '--:--') {
    return null
  }

  const [hoursText, minutesText] = value.split(':')
  const hours = Number(hoursText)
  const minutes = Number(minutesText)

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null
  }

  return hours * 60 + minutes
}

const optionalBoundaryMinutes = (value: string | null | undefined): number | null => {
  const minutes = timeToMinutes(value)
  return minutes === 0 ? null : minutes
}

const midpointMinutes = (start: number | null, end: number | null): number | null => {
  if (start === null || end === null || end <= start) {
    return null
  }

  return Math.floor((start + end) / 2)
}

const minutesOfDate = (date: Date): number => {
  const [hoursText, minutesText] = formatAppTimeKey(date).split(':')
  return Number(hoursText) * 60 + Number(minutesText)
}

const findFirstPunchInRange = <TPunch extends NotificationPunchLike>(
  punches: TPunch[],
  startMinutes: number,
  endMinutes: number
): TPunch | null =>
  punches.find((punch) => {
    const value = minutesOfDate(punch.time)
    return value >= startMinutes && value <= endMinutes
  }) ?? null

const findLastPunchInRange = <TPunch extends NotificationPunchLike>(
  punches: TPunch[],
  startMinutes: number,
  endMinutes: number
): TPunch | null => {
  for (let index = punches.length - 1; index >= 0; index -= 1) {
    const value = minutesOfDate(punches[index]!.time)
    if (value >= startMinutes && value <= endMinutes) {
      return punches[index]!
    }
  }

  return null
}

const classifyFromExplicitWindows = <TPunch extends NotificationPunchLike>(
  punches: TPunch[],
  windows: NotificationInOutWindow[]
): NotificationPunchClassification<TPunch> | null => {
  const arrivalWindows = windows
    .map((window) => ({
      start: timeToMinutes(window.startIn),
      end: timeToMinutes(window.endIn)
    }))
    .filter((window) => window.start !== null && window.end !== null)
    .sort((left, right) => left.start! - right.start!)

  const checkoutWindows = windows
    .map((window) => ({
      start: timeToMinutes(window.startOut),
      end: timeToMinutes(window.endOut)
    }))
    .filter((window) => window.start !== null && window.end !== null)
    .sort((left, right) => left.end! - right.end!)

  if (arrivalWindows.length === 0 && checkoutWindows.length === 0) {
    return null
  }

  const firstArrivalWindow = arrivalWindows[0] ?? null
  const lastCheckoutWindow = checkoutWindows.at(-1) ?? null

  return {
    strategy: 'window',
    firstArrivalPunch: firstArrivalWindow
      ? findFirstPunchInRange(punches, firstArrivalWindow.start!, firstArrivalWindow.end!)
      : null,
    finalCheckoutPunch: lastCheckoutWindow
      ? findLastPunchInRange(punches, lastCheckoutWindow.start!, lastCheckoutWindow.end!)
      : null
  }
}

const classifyFromDerivedShiftWindows = <TPunch extends NotificationPunchLike>(
  punches: TPunch[],
  shift: Pick<ShiftRecord, 'onduty' | 'offduty' | 'onLunch' | 'offLunch'> | null
): NotificationPunchClassification<TPunch> | null => {
  if (!shift) {
    return null
  }

  const onduty = timeToMinutes(shift.onduty)
  const offduty = timeToMinutes(shift.offduty)
  const lunchStart = optionalBoundaryMinutes(shift.onLunch)
  const lunchEnd = optionalBoundaryMinutes(shift.offLunch)

  if (onduty === null || offduty === null) {
    return null
  }

  const arrivalEnd = midpointMinutes(onduty, lunchStart ?? lunchEnd ?? offduty)
  const checkoutStart = midpointMinutes(lunchEnd ?? lunchStart ?? onduty, offduty)

  if (arrivalEnd === null || checkoutStart === null) {
    return null
  }

  return {
    strategy: 'window',
    firstArrivalPunch: findFirstPunchInRange(punches, DAY_START_MINUTES, arrivalEnd),
    finalCheckoutPunch: findLastPunchInRange(punches, checkoutStart, DAY_END_MINUTES)
  }
}

export const classifyNotificationPunches = <TPunch extends NotificationPunchLike>(
  punches: TPunch[],
  config: NotificationWindowConfig | null
): NotificationPunchClassification<TPunch> => {
  const explicit = classifyFromExplicitWindows(punches, config?.windows ?? [])
  if (explicit) {
    return explicit
  }

  if (config?.inOutMode === 0 || config?.inOutMode === 1 || config?.inOutMode === null) {
    const derived = classifyFromDerivedShiftWindows(punches, config?.shift ?? null)
    if (derived) {
      return derived
    }
  }

  return {
    strategy: 'raw',
    firstArrivalPunch: punches.find((punch) => punch.type === 'I') ?? null,
    finalCheckoutPunch: null
  }
}
