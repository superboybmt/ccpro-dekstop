import type { AttendanceDayRecord, AttendanceStatus, HistoryData, HistoryFilter } from '@shared/api'
import { createAppDateTime, getAppDayOfWeek } from '@shared/app-time'
import { getPool } from '../db/sql'
import { SqlAttendanceRepository, type PunchRecord, type ShiftRecord } from './attendance-service'
import { addDays, formatSqlDate, formatSqlDateTime, parseSqlDate, parseSqlDateTime } from './sql-datetime'

export interface HistoryRepository {
  getShiftForUser(userEnrollNumber: number, date: Date): Promise<ShiftRecord | null>
  getPunchesForRange(userEnrollNumber: number, startDate: Date, endDate: Date): Promise<PunchRecord[]>
}

const formatDateKey = (date: Date): string => formatSqlDate(date)

const formatDateLabel = (date: Date): string => {
  const [year, month, day] = formatDateKey(date).split('-')
  return `${day}/${month}/${year}`
}

const formatTime = (date: Date | null): string =>
  date ? formatSqlDateTime(date).slice(11, 16) : '--:--'

const formatHourDiff = (start: Date | null, end: Date | null): string => {
  if (!start || !end || end <= start) return '0h 00m'
  const totalMinutes = Math.round((end.getTime() - start.getTime()) / 60000)
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, '0')}m`
}

const parseShiftDateTime = (date: string, time: string): Date => parseSqlDateTime(`${date} ${time}:00`)

const isScheduledOff = (date: Date, shift: ShiftRecord | null): boolean => {
  if (!shift) return false
  if (getAppDayOfWeek(date) === 6) return shift.isAbsentSaturday
  if (getAppDayOfWeek(date) === 0) return shift.isAbsentSunday
  return false
}

export class HistoryService {
  constructor(private readonly repository: HistoryRepository) {}

  async getHistory(userEnrollNumber: number, filter: HistoryFilter): Promise<HistoryData> {
    const { startDate, endDate, month } = this.resolveRange(filter)
    const shift = await this.repository.getShiftForUser(userEnrollNumber, startDate)
    const punches = await this.repository.getPunchesForRange(userEnrollNumber, startDate, endDate)

    const grouped = new Map<string, Date[]>()
    for (const punch of punches) {
      const key = formatDateKey(punch.time)
      const items = grouped.get(key) ?? []
      items.push(punch.time)
      grouped.set(key, items)
    }

    const allRecords: AttendanceDayRecord[] = []
    let onTimeDays = 0
    let overtimeMinutes = 0
    let absences = 0

    const cursor = new Date(startDate)
    const todayKey = formatDateKey(new Date())
    while (cursor <= endDate) {
      const dateKey = formatDateKey(cursor)
      const dayPunches = (grouped.get(dateKey) ?? []).sort((left, right) => left.getTime() - right.getTime())
      const firstPunch = dayPunches[0] ?? null
      const lastPunch = dayPunches.length > 1 ? dayPunches.at(-1) ?? null : null

      if (dayPunches.length === 0) {
        if (!isScheduledOff(cursor, shift) && dateKey <= todayKey) {
          absences += 1
        }
      } else {
        const lateMinutes = this.getLateMinutes(dateKey, firstPunch, shift)
        const status: AttendanceStatus = lateMinutes > 0 ? 'late' : 'on-time'
        if (status === 'on-time') onTimeDays += 1

        overtimeMinutes += this.getOvertimeMinutes(dateKey, lastPunch, shift)

        allRecords.push({
          date: formatDateLabel(cursor),
          checkIn: formatTime(firstPunch),
          checkOut: formatTime(lastPunch),
          totalHours: formatHourDiff(firstPunch, lastPunch),
          status,
          shiftName: shift?.shiftName ?? 'Ca mặc định'
        })
      }

      cursor.setDate(cursor.getDate() + 1)
    }

    allRecords.sort((left, right) => (left.date < right.date ? 1 : -1))

    const page = filter.page ?? 1
    const pageSize = filter.pageSize ?? 10
    const offset = (page - 1) * pageSize

    return {
      filter: {
        month,
        startDate: formatDateKey(startDate),
        endDate: formatDateKey(endDate),
        page,
        pageSize
      },
      stats: {
        totalWorkingDays: allRecords.length,
        onTimeRate: allRecords.length === 0 ? 0 : Math.round((onTimeDays / allRecords.length) * 100),
        totalOvertimeHours: Number((overtimeMinutes / 60).toFixed(1)),
        absences
      },
      records: allRecords.slice(offset, offset + pageSize),
      total: allRecords.length
    }
  }

  private resolveRange(filter: HistoryFilter): {
    startDate: Date
    endDate: Date
    month: string | null
  } {
    if (filter.startDate && filter.endDate) {
      return {
        month: null,
        startDate: parseSqlDate(filter.startDate),
        endDate: parseSqlDate(filter.endDate)
      }
    }

    const month = filter.month ?? formatDateKey(new Date()).slice(0, 7)
    const [year, monthIndex] = month.split('-').map(Number)
    return {
      month,
      startDate: createAppDateTime(year, monthIndex, 1),
      endDate: createAppDateTime(year, monthIndex + 1, 0)
    }
  }

  private getLateMinutes(dateKey: string, firstPunch: Date | null, shift: ShiftRecord | null): number {
    if (!firstPunch || !shift?.onduty || shift.onduty === '--:--') return 0
    const shiftStart = parseShiftDateTime(dateKey, shift.onduty)
    return Math.max(
      0,
      Math.round((firstPunch.getTime() - shiftStart.getTime()) / 60000) - shift.lateGraceMinutes
    )
  }

  private getOvertimeMinutes(dateKey: string, lastPunch: Date | null, shift: ShiftRecord | null): number {
    if (!lastPunch || !shift?.offduty || shift.offduty === '--:--') return 0
    const shiftEnd = parseShiftDateTime(dateKey, shift.offduty)
    return Math.max(0, Math.round((lastPunch.getTime() - shiftEnd.getTime()) / 60000))
  }
}

export class SqlHistoryRepository implements HistoryRepository {
  async getShiftForUser(userEnrollNumber: number, date: Date): Promise<ShiftRecord | null> {
    return new SqlAttendanceRepository().getShiftForUser(userEnrollNumber, date)
  }

  async getPunchesForRange(
    userEnrollNumber: number,
    startDate: Date,
    endDate: Date
  ): Promise<PunchRecord[]> {
    const pool = await getPool('wise-eye')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)
    request.input('startDate', formatSqlDateTime(startDate))
    request.input('endDate', formatSqlDateTime(addDays(endDate, 1)))

    const result = await request.query(`
      SELECT
        CONVERT(varchar(19), TimeStr, 120) AS TimeStrText,
        OriginType
      FROM dbo.CheckInOut
      WHERE UserEnrollNumber = @userEnrollNumber
        AND TimeStr >= CONVERT(datetime, @startDate, 120)
        AND TimeStr < CONVERT(datetime, @endDate, 120)
      ORDER BY TimeStr ASC
    `)

    return result.recordset.map((row) => ({
      time: parseSqlDateTime(row.TimeStrText),
      type: row.OriginType === 'I' || row.OriginType === 'O' ? row.OriginType : null
    }))
  }
}
