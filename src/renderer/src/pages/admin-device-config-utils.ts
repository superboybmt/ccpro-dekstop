/**
 * Shared constants and utility functions for the Admin Device Config page.
 *
 * Extracted from admin-device-config-page.tsx for maintainability.
 * All logic is unchanged — only the file location moved.
 */

import { Sunrise, Coffee, Sun, Moon } from 'lucide-react'
import type { RemoteRiskPolicyMode, MutationResult } from '@shared/api'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STATE_MODE_LABELS: Record<number, string> = {
  0: 'Mode 0 — Off',
  1: 'Mode 1 — Manual',
  2: 'Mode 2 — Auto',
  3: 'Mode 3 — Manual + Auto',
  4: 'Mode 4 — Manual Fixed',
  5: 'Mode 5 — Fixed'
}

export const SCHEDULE_META = [
  { label: 'Vào ca sáng', icon: Sunrise, color: '#22c55e', defaultTime: '07:30' },
  { label: 'Ra nghỉ trưa', icon: Coffee, color: '#f59e0b', defaultTime: '11:30' },
  { label: 'Vào ca chiều', icon: Sun, color: '#3b82f6', defaultTime: '13:00' },
  { label: 'Tan ca', icon: Moon, color: '#8b5cf6', defaultTime: '17:30' }
]

export const missingAdminSettingsMessage =
  'Bản app hiện tại chưa hỗ trợ đồng bộ chính sách bảo mật. Hãy mở lại app sau khi cập nhật build mới.'

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/** Extract HH:mm from various ZK timezone data formats */
export const parseTimeToHHmm = (raw: string): string => {
  if (!raw) return ''
  // Already HH:mm
  if (/^\d{2}:\d{2}$/.test(raw)) return raw

  try {
    const parsed = JSON.parse(raw)
    // Try common time keys
    const time = parsed.STime || parsed.ETime || parsed.time || parsed.StartTime || parsed.Time
    if (time && /^\d{2}:\d{2}/.test(String(time))) return String(time).slice(0, 5)

    // ZK SSR statetimezone rows store weekday values as HHMM numbers.
    const tz =
      parsed.TimezoneId ??
      parsed.timezone ??
      parsed.tz ??
      parsed.montime ??
      parsed.tuetime ??
      parsed.wedtime ??
      parsed.thutime ??
      parsed.fritime ??
      parsed.sattime ??
      parsed.suntime
    if (tz !== undefined) {
      const num = Number(tz)
      if (!isNaN(num) && num >= 0 && num <= 2359) {
        const hh = String(Math.floor(num / 100)).padStart(2, '0')
        const mm = String(num % 100).padStart(2, '0')
        return `${hh}:${mm}`
      }
    }
    return ''
  } catch {
    return ''
  }
}

export const parseStateName = (raw: string, fallback: string): string => {
  try {
    const parsed = JSON.parse(raw)
    return parsed.StateName || parsed.Name || parsed.name || fallback
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------------------
// Aria label helpers
// ---------------------------------------------------------------------------

export const getShiftTimeAriaLabel = (shiftCode: string, field: 'onduty' | 'onLunch' | 'offLunch' | 'offduty'): string => {
  switch (field) {
    case 'onduty':
      return `Ca ${shiftCode} vao ca`
    case 'onLunch':
      return `Ca ${shiftCode} nghi trua`
    case 'offLunch':
      return `Ca ${shiftCode} het nghi trua`
    case 'offduty':
      return `Ca ${shiftCode} tan ca`
  }
}

export const getScheduleTimeAriaLabel = (index: number): string => {
  switch (index) {
    case 0:
      return 'Lich auto-switch vao ca sang'
    case 1:
      return 'Lich auto-switch ra nghi trua'
    case 2:
      return 'Lich auto-switch vao ca chieu'
    case 3:
      return 'Lich auto-switch tan ca'
    default:
      return `Lich auto-switch moc ${index + 1}`
  }
}

// ---------------------------------------------------------------------------
// Admin settings bridge
// ---------------------------------------------------------------------------

export type AdminSettingsBridge = {
  getRemoteRiskPolicy: () => Promise<{ mode: RemoteRiskPolicyMode }>
  saveRemoteRiskPolicy: (
    policy: { mode: RemoteRiskPolicyMode }
  ) => Promise<MutationResult & { mode: RemoteRiskPolicyMode }>
}

export const resolveAdminSettingsBridge = (): AdminSettingsBridge | null => {
  const bridge = (window.ccpro as typeof window.ccpro & { adminSettings?: AdminSettingsBridge }).adminSettings
  if (!bridge) return null
  if (typeof bridge.getRemoteRiskPolicy !== 'function') return null
  if (typeof bridge.saveRemoteRiskPolicy !== 'function') return null
  return bridge
}
