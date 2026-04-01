import { formatAppDateKey, formatAppDateTimeKey, parseAppDateTime } from '@shared/app-time'

const toAppDate = (value: string): Date => parseAppDateTime(value)

const formatDateLabel = (value: Date): string => {
  const [year, month, day] = formatAppDateKey(value).split('-')
  return `${day}/${month}/${year}`
}

export const formatDateTime = (value: string | null): string => {
  if (!value) return '--'

  const date = toAppDate(value)
  const [dateKey, timeKey] = formatAppDateTimeKey(date).split(' ')
  const [year, month, day] = dateKey.split('-')
  return `${timeKey.slice(0, 5)} ${day}/${month}/${year}`
}

export const formatRelativeTime = (value: string): string => {
  const diffMinutes = Math.round((Date.now() - toAppDate(value).getTime()) / 60000)
  if (diffMinutes < 1) return 'Vừa xong'
  if (diffMinutes < 60) return `${diffMinutes} phút trước`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} giờ trước`
  return formatDateLabel(toAppDate(value))
}

export const formatPercent = (value: number): string => `${Math.round(value)}%`
