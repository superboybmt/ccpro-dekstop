import type { AdminShiftItem, AdminShiftList, AdminShiftUpdatePayload, MutationResult } from '@shared/api'
import { getPool } from '../db/sql'
import { formatSqlDateTime } from './sql-datetime'

export interface AdminShiftRepository {
  listShifts(): Promise<AdminShiftItem[]>
  getShiftById(shiftId: number): Promise<AdminShiftItem | null>
  updateShift(payload: AdminShiftUpdatePayload): Promise<void>
  writeAuditLog(adminId: number, shiftId: number, before: object, after: object): Promise<void>
}

export class AdminShiftService {
  constructor(private readonly repository: AdminShiftRepository) {}

  async listShifts(): Promise<AdminShiftList> {
    const shifts = await this.repository.listShifts()
    return { shifts }
  }

  async updateShift(payload: AdminShiftUpdatePayload, adminId: number): Promise<MutationResult> {
    const before = await this.repository.getShiftById(payload.shiftId)
    if (!before) {
      return { ok: false, message: `Không tìm thấy ca với ShiftID ${payload.shiftId}` }
    }

    await this.repository.updateShift(payload)

    const after = {
      onduty: payload.onduty,
      offduty: payload.offduty,
      onLunch: payload.onLunch,
      offLunch: payload.offLunch
    }

    await this.repository.writeAuditLog(adminId, payload.shiftId, {
      onduty: before.onduty,
      offduty: before.offduty,
      onLunch: before.onLunch,
      offLunch: before.offLunch
    }, after)

    return { ok: true, message: `Đã cập nhật ca "${before.shiftName}" thành công` }
  }
}

const formatTwoDigits = (value: number): string => String(value).padStart(2, '0')

const normalizeHourMinute = (hourText: string, minuteText: string): string | null => {
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return `${formatTwoDigits(hour)}:${formatTwoDigits(minute)}`
}

const normalizeMeridiemTime = (hourText: string, minuteText: string, meridiemText: string): string | null => {
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null

  const meridiem = meridiemText.toUpperCase()
  const normalizedHour = meridiem === 'AM' ? hour % 12 : (hour % 12) + 12
  return `${formatTwoDigits(normalizedHour)}:${formatTwoDigits(minute)}`
}

/** Parse SQL Server nvarchar time column into canonical HH:mm */
const formatTimeColumn = (value: Date | string | null): string | null => {
  if (value === null || value === undefined) return null

  if (value instanceof Date) {
    return `${formatTwoDigits(value.getUTCHours())}:${formatTwoDigits(value.getUTCMinutes())}`
  }

  const str = String(value).trim()
  if (!str) return null

  const directMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (directMatch) {
    return normalizeHourMinute(directMatch[1], directMatch[2])
  }

  const meridiemMatch = str.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)/i)
  if (meridiemMatch) {
    return normalizeMeridiemTime(meridiemMatch[1], meridiemMatch[2], meridiemMatch[3])
  }

  const embeddedMatch = str.match(/(\d{1,2}):(\d{2})(?::\d{2})?/)
  if (embeddedMatch) {
    return normalizeHourMinute(embeddedMatch[1], embeddedMatch[2])
  }

  return null
}

const toStoredShiftTime = (value: string): string => {
  const normalized = formatTimeColumn(value)
  if (!normalized) {
    throw new Error(`Gia tri gio khong hop le: ${value}`)
  }
  return normalized
}

export class SqlAdminShiftRepository implements AdminShiftRepository {
  async listShifts(): Promise<AdminShiftItem[]> {
    const pool = await getPool('wise-eye')

    const result = await pool.request().query(`
      SELECT
        s.ShiftID,
        s.ShiftCode,
        sc.SchName AS ShiftName,
        s.Onduty,
        s.Offduty,
        s.OnLunch,
        s.OffLunch
      FROM dbo.Shifts s
      INNER JOIN dbo.WSchedules ws ON ws.ShiftID = s.ShiftID
      INNER JOIN dbo.Schedule sc ON sc.SchID = ws.SchID
      ORDER BY s.ShiftID
    `)

    // Deduplicate by ShiftID (a shift can appear in multiple schedules)
    const seen = new Set<number>()
    const shifts: AdminShiftItem[] = []

    for (const row of result.recordset) {
      if (seen.has(row.ShiftID)) continue
      seen.add(row.ShiftID)

      shifts.push({
        shiftId: row.ShiftID,
        shiftCode: row.ShiftCode ?? '',
        shiftName: row.ShiftName ?? `Shift ${row.ShiftID}`,
        onduty: formatTimeColumn(row.Onduty) ?? '00:00',
        offduty: formatTimeColumn(row.Offduty) ?? '00:00',
        onLunch: formatTimeColumn(row.OnLunch),
        offLunch: formatTimeColumn(row.OffLunch)
      })
    }

    return shifts
  }

  async getShiftById(shiftId: number): Promise<AdminShiftItem | null> {
    const pool = await getPool('wise-eye')
    const request = pool.request()
    request.input('shiftId', shiftId)

    const result = await request.query(`
      SELECT TOP 1
        s.ShiftID,
        s.ShiftCode,
        sc.SchName AS ShiftName,
        s.Onduty,
        s.Offduty,
        s.OnLunch,
        s.OffLunch
      FROM dbo.Shifts s
      LEFT JOIN dbo.WSchedules ws ON ws.ShiftID = s.ShiftID
      LEFT JOIN dbo.Schedule sc ON sc.SchID = ws.SchID
      WHERE s.ShiftID = @shiftId
    `)

    const row = result.recordset[0]
    if (!row) return null

    return {
      shiftId: row.ShiftID,
      shiftCode: row.ShiftCode ?? '',
      shiftName: row.ShiftName ?? `Shift ${row.ShiftID}`,
      onduty: formatTimeColumn(row.Onduty) ?? '00:00',
      offduty: formatTimeColumn(row.Offduty) ?? '00:00',
      onLunch: formatTimeColumn(row.OnLunch),
      offLunch: formatTimeColumn(row.OffLunch)
    }
  }

  async updateShift(payload: AdminShiftUpdatePayload): Promise<void> {
    const pool = await getPool('wise-eye')
    const request = pool.request()
    request.input('shiftId', payload.shiftId)
    request.input('onduty', toStoredShiftTime(payload.onduty))
    request.input('offduty', toStoredShiftTime(payload.offduty))

    // OnLunch and OffLunch are nullable
    if (payload.onLunch !== null) {
      request.input('onLunch', toStoredShiftTime(payload.onLunch))
    } else {
      request.input('onLunch', null)
    }

    if (payload.offLunch !== null) {
      request.input('offLunch', toStoredShiftTime(payload.offLunch))
    } else {
      request.input('offLunch', null)
    }

    await request.query(`
      UPDATE dbo.Shifts
      SET
        Onduty = @onduty,
        Offduty = @offduty,
        OnLunch = @onLunch,
        OffLunch = @offLunch
      WHERE ShiftID = @shiftId
    `)
  }

  async writeAuditLog(adminId: number, shiftId: number, before: object, after: object): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('adminId', adminId)
    request.input('shiftId', shiftId)
    request.input('beforeJson', JSON.stringify(before))
    request.input('afterJson', JSON.stringify(after))
    request.input('now', formatSqlDateTime(new Date()))

    await request.query(`
      INSERT INTO dbo.shift_audit_logs (
        admin_id, shift_id, before_json, after_json, created_at
      )
      VALUES (
        @adminId, @shiftId, @beforeJson, @afterJson, CONVERT(datetime2, @now, 120)
      )
    `)
  }
}
