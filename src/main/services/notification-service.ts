import type { NotificationItem } from '@shared/api'
import { formatAppIsoOffset } from '@shared/app-time'
import { appConfig } from '../config/app-config'
import { getPool } from '../db/sql'
import { addDays, formatSqlDate, formatSqlDateTime, parseSqlDateTime } from './sql-datetime'
import { type ShiftRecord } from './attendance-service'
import {
  classifyNotificationPunches,
  type NotificationInOutWindow,
  type NotificationWindowConfig
} from './notification-inout'

export interface NotificationPunchRecord {
  time: Date
  type: 'I' | 'O' | null
  workDate: string
}

export interface NotificationDraft {
  notificationKey: string
  category: 'late' | 'missing-checkout' | 'system'
  title: string
  description: string
  eventDate: string
  timestamp: Date
}

export interface NotificationDayConfig extends NotificationWindowConfig {
  inOutId: number | null
  inOutCode: string | null
  inOutName: string | null
}

export interface NotificationRepository {
  getDayConfigForUser(userEnrollNumber: number, date: Date): Promise<NotificationDayConfig | null>
  getPunchesForRange(
    userEnrollNumber: number,
    startDate: Date,
    endDate: Date
  ): Promise<NotificationPunchRecord[]>
  reconcileNotifications(
    userEnrollNumber: number,
    notifications: NotificationDraft[]
  ): Promise<void>
  listNotifications(userEnrollNumber: number): Promise<NotificationItem[]>
  markRead(userEnrollNumber: number, id: number): Promise<void>
  markAllRead(userEnrollNumber: number): Promise<void>
}

const formatDateKey = (date: Date): string => formatSqlDate(date)

const formatEventDate = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-')
  return `${day}/${month}/${year}`
}

const resolveDateTime = (dateKey: string, time: string): Date => parseSqlDateTime(`${dateKey} ${time}:00`)

const addMinutes = (date: Date, minutes: number): Date => {
  const next = new Date(date)
  next.setMinutes(next.getMinutes() + minutes)
  return next
}

const groupPunchesByWorkDate = (
  punches: NotificationPunchRecord[]
): Map<string, NotificationPunchRecord[]> => {
  const grouped = new Map<string, NotificationPunchRecord[]>()

  for (const punch of punches) {
    const values = grouped.get(punch.workDate) ?? []
    values.push(punch)
    grouped.set(punch.workDate, values)
  }

  return grouped
}

const buildLateNotification = (args: {
  userEnrollNumber: number
  dateKey: string
  lateMinutes: number
  timestamp: Date
}): NotificationDraft => ({
  notificationKey: `late:${args.userEnrollNumber}:${args.dateKey}`,
  category: 'late',
  title: 'Đi trễ',
  description: `Bạn đã đi trễ ${args.lateMinutes} phút ngày ${formatEventDate(args.dateKey)}`,
  eventDate: args.dateKey,
  timestamp: args.timestamp
})

const buildMissingCheckoutNotification = (args: {
  userEnrollNumber: number
  dateKey: string
  timestamp: Date
}): NotificationDraft => ({
  notificationKey: `missing:${args.userEnrollNumber}:${args.dateKey}`,
  category: 'missing-checkout',
  title: 'Thiếu chấm ra',
  description: `Bạn chưa chấm ra ngày ${formatEventDate(args.dateKey)}`,
  eventDate: args.dateKey,
  timestamp: args.timestamp
})

const shouldFlagMissingCheckout = (args: {
  dateKey: string
  offduty: string
  graceMinutes: number
}): boolean => {
  const todayKey = formatDateKey(new Date())
  if (args.dateKey < todayKey) {
    return true
  }

  const shiftEnd = addMinutes(resolveDateTime(args.dateKey, args.offduty), args.graceMinutes)
  return new Date().getTime() > shiftEnd.getTime()
}

export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  async list(userEnrollNumber: number): Promise<NotificationItem[]> {
    const notifications = await this.buildNotifications(userEnrollNumber)
    await this.repository.reconcileNotifications(userEnrollNumber, notifications)
    return this.repository.listNotifications(userEnrollNumber)
  }

  async markRead(userEnrollNumber: number, id: number): Promise<void> {
    await this.repository.markRead(userEnrollNumber, id)
  }

  async markAllRead(userEnrollNumber: number): Promise<void> {
    await this.repository.markAllRead(userEnrollNumber)
  }

  private async buildNotifications(userEnrollNumber: number): Promise<NotificationDraft[]> {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(endDate.getDate() - appConfig.notifications.lookbackDays)

    const punches = await this.repository.getPunchesForRange(userEnrollNumber, startDate, endDate)
    const grouped = groupPunchesByWorkDate(punches)
    const dayConfigs = new Map(
      await Promise.all(
        Array.from(grouped.keys(), async (dateKey) => {
          const config = await this.repository.getDayConfigForUser(
            userEnrollNumber,
            resolveDateTime(dateKey, '00:00')
          )

          return [dateKey, config] as const
        })
      )
    )
    const notifications: NotificationDraft[] = []

    for (const [dateKey, dayPunches] of grouped.entries()) {
      const sortedPunches = dayPunches.sort((left, right) => left.time.getTime() - right.time.getTime())
      const sameDayPunches = sortedPunches.filter((punch) => formatDateKey(punch.time) === dateKey)
      const dayConfig = dayConfigs.get(dateKey) ?? null
      const classification = classifyNotificationPunches(sameDayPunches, dayConfig)
      const shift = dayConfig?.shift ?? null
      const firstArrivalPunch = classification.firstArrivalPunch

      if (shift?.onduty && shift.onduty !== '--:--' && firstArrivalPunch) {
        const shiftStart = resolveDateTime(dateKey, shift.onduty)
        const lateMinutes =
          Math.round((firstArrivalPunch.time.getTime() - shiftStart.getTime()) / 60000) -
          shift.lateGraceMinutes

        if (lateMinutes > 0) {
          notifications.push(
            buildLateNotification({
              userEnrollNumber,
              dateKey,
              lateMinutes,
              timestamp: firstArrivalPunch.time
            })
          )
        }
      }

      const hasCheckoutPunch =
        classification.strategy === 'window'
          ? Boolean(classification.finalCheckoutPunch)
          : (sameDayPunches.at(-1)?.type ?? null) === 'O'

      if (
        shift?.offduty &&
        shift.offduty !== '--:--' &&
        !hasCheckoutPunch &&
        shouldFlagMissingCheckout({
          dateKey,
          offduty: shift.offduty,
          graceMinutes: appConfig.notifications.missingCheckoutGraceMinutes
        })
      ) {
        notifications.push(
          buildMissingCheckoutNotification({
            userEnrollNumber,
            dateKey,
            timestamp: resolveDateTime(dateKey, shift.offduty)
          })
        )
      }
    }

    return notifications
  }
}

export class SqlNotificationRepository implements NotificationRepository {
  async getDayConfigForUser(userEnrollNumber: number, date: Date): Promise<NotificationDayConfig | null> {
    const pool = await getPool('wise-eye')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)
    request.input('dayId', resolveShiftDayId(date))

    const result = await request.query(`
      SELECT
        s.SchName AS ShiftName,
        sh.ShiftCode,
        sh.Onduty,
        sh.Offduty,
        sh.OnLunch,
        sh.OffLunch,
        sh.WorkingTime,
        ISNULL(sh.LateGrace, 0) AS LateGrace,
        CAST(ISNULL(s.IsAbsentSat, 0) AS bit) AS IsAbsentSaturday,
        CAST(ISNULL(s.IsAbsentSun, 0) AS bit) AS IsAbsentSunday,
        s.InOutID,
        ia.InOutCode,
        ia.InOutName,
        ia.InOutMode,
        io.StartIn,
        io.EndIn,
        io.StartOut,
        io.EndOut
      FROM dbo.UserInfo u
      LEFT JOIN dbo.Schedule s ON s.SchID = u.SchID
      OUTER APPLY (
        SELECT TOP 1 ws.ShiftID
        FROM dbo.WSchedules ws
        WHERE ws.SchID = u.SchID AND ws.DayID = @dayId
        ORDER BY ws.DayID
      ) dayShift
      OUTER APPLY (
        SELECT TOP 1 ws.ShiftID
        FROM dbo.WSchedules ws
        WHERE ws.SchID = u.SchID
        ORDER BY ws.DayID
      ) fallbackShift
      LEFT JOIN dbo.Shifts sh ON sh.ShiftID = COALESCE(dayShift.ShiftID, fallbackShift.ShiftID)
      LEFT JOIN dbo.InOutArr ia ON ia.InOutID = s.InOutID
      LEFT JOIN dbo.InOut io ON io.InOutID = ia.InOutID
      WHERE u.UserEnrollNumber = @userEnrollNumber
      ORDER BY io.ID ASC
    `)

    const rows = result.recordset
    const firstRow = rows[0]
    if (!firstRow) return null

    const shift: ShiftRecord = {
      shiftName: firstRow.ShiftName ?? 'Ca mac dinh',
      shiftCode: firstRow.ShiftCode ?? null,
      onduty: firstRow.Onduty ?? '--:--',
      offduty: firstRow.Offduty ?? '--:--',
      onLunch: firstRow.OnLunch ?? null,
      offLunch: firstRow.OffLunch ?? null,
      workingMinutes: firstRow.WorkingTime ?? null,
      lateGraceMinutes: firstRow.LateGrace ?? 0,
      isAbsentSaturday: firstRow.IsAbsentSaturday,
      isAbsentSunday: firstRow.IsAbsentSunday
    }

    const windows: NotificationInOutWindow[] = rows
      .filter((row) => row.StartIn || row.EndIn || row.StartOut || row.EndOut)
      .map((row) => ({
        startIn: row.StartIn ?? null,
        endIn: row.EndIn ?? null,
        startOut: row.StartOut ?? null,
        endOut: row.EndOut ?? null
      }))

    return {
      shift,
      inOutId: firstRow.InOutID ?? null,
      inOutCode: firstRow.InOutCode ?? null,
      inOutName: firstRow.InOutName ?? null,
      inOutMode: firstRow.InOutMode ?? null,
      windows
    }
  }

  async getPunchesForRange(
    userEnrollNumber: number,
    startDate: Date,
    endDate: Date
  ): Promise<NotificationPunchRecord[]> {
    const pool = await getPool('wise-eye')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)
    request.input('startDate', formatSqlDateTime(startDate))
    request.input('endDate', formatSqlDateTime(addDays(endDate, 1)))

    const result = await request.query(`
      SELECT
        CONVERT(varchar(19), TimeStr, 120) AS TimeStrText,
        CONVERT(varchar(10), TimeDate, 23) AS TimeDateText,
        OriginType
      FROM dbo.CheckInOut
      WHERE UserEnrollNumber = @userEnrollNumber
        AND TimeStr >= CONVERT(datetime, @startDate, 120)
        AND TimeStr < CONVERT(datetime, @endDate, 120)
      ORDER BY TimeStr ASC
    `)

    return result.recordset.map((row) => ({
      time: parseSqlDateTime(row.TimeStrText),
      workDate: row.TimeDateText,
      type: row.OriginType === 'I' || row.OriginType === 'O' ? row.OriginType : null
    }))
  }

  async reconcileNotifications(
    userEnrollNumber: number,
    notifications: NotificationDraft[]
  ): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)

    if (notifications.length === 0) {
      await request.query(`
        DELETE FROM dbo.app_notifications
        WHERE user_enroll_number = @userEnrollNumber
          AND category IN ('late', 'missing-checkout')
      `)
      return
    }

      const valuesSql = notifications
      .map((notification, index) => {
        request.input(`notificationKey${index}`, notification.notificationKey)
        request.input(`category${index}`, notification.category)
        request.input(`title${index}`, notification.title)
        request.input(`description${index}`, notification.description)
        request.input(`eventDate${index}`, notification.eventDate)
        request.input(`timestamp${index}`, formatSqlDateTime(notification.timestamp))

        return `(
          @notificationKey${index},
          @category${index},
          @title${index},
          @description${index},
          @eventDate${index},
          @timestamp${index}
        )`
      })
      .join(',\n        ')

    await request.query(`
      DECLARE @source TABLE (
        notification_key NVARCHAR(120) NOT NULL,
        category NVARCHAR(50) NOT NULL,
        title NVARCHAR(150) NOT NULL,
        description NVARCHAR(500) NOT NULL,
        event_date DATE NOT NULL,
        created_at VARCHAR(19) NOT NULL
      );

      INSERT INTO @source (
        notification_key,
        category,
        title,
        description,
        event_date,
        created_at
      )
      VALUES
        ${valuesSql};

      MERGE dbo.app_notifications AS target
      USING (
        SELECT
          @userEnrollNumber AS user_enroll_number,
          notification_key,
          category,
          title,
          description,
          event_date,
          CONVERT(datetime, created_at, 120) AS created_at
        FROM @source
      ) AS source
      ON target.notification_key = source.notification_key
      WHEN MATCHED THEN
        UPDATE SET
          category = source.category,
          title = source.title,
          description = source.description,
          event_date = source.event_date
      WHEN NOT MATCHED THEN
        INSERT (
          user_enroll_number,
          notification_key,
          category,
          title,
          description,
          event_date,
          created_at
        )
        VALUES (
          source.user_enroll_number,
          source.notification_key,
          source.category,
          source.title,
          source.description,
          source.event_date,
          source.created_at
        );

      DELETE FROM dbo.app_notifications
      WHERE user_enroll_number = @userEnrollNumber
        AND category IN ('late', 'missing-checkout')
        AND notification_key NOT IN (SELECT notification_key FROM @source);
    `)
  }

  async listNotifications(userEnrollNumber: number): Promise<NotificationItem[]> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)

    const result = await request.query(`
      SELECT
        id,
        category,
        title,
        description,
        CONVERT(varchar(10), event_date, 23) AS event_date,
        CONVERT(varchar(19), created_at, 120) AS created_at,
        is_read
      FROM dbo.app_notifications
      WHERE user_enroll_number = @userEnrollNumber
      ORDER BY created_at DESC
    `)

    return result.recordset.map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      description: row.description,
      createdAt: formatAppIsoOffset(parseSqlDateTime(row.created_at)),
      eventDate: row.event_date ?? null,
      isRead: row.is_read
    }))
  }

  async markRead(userEnrollNumber: number, id: number): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)
    request.input('id', id)
    request.input('readAt', formatSqlDateTime(new Date()))

    await request.query(`
      UPDATE dbo.app_notifications
      SET is_read = 1,
          read_at = CONVERT(datetime2, @readAt, 120)
      WHERE id = @id
        AND user_enroll_number = @userEnrollNumber
    `)
  }

  async markAllRead(userEnrollNumber: number): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)
    request.input('readAt', formatSqlDateTime(new Date()))

    await request.query(`
      UPDATE dbo.app_notifications
      SET is_read = 1,
          read_at = CONVERT(datetime2, @readAt, 120)
      WHERE user_enroll_number = @userEnrollNumber
        AND is_read = 0
    `)
  }
}

const resolveShiftDayId = (date: Date): number => {
  const day = date.getDay()
  return day === 0 ? 7 : day
}
