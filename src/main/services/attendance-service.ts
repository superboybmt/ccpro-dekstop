import type {
  AttendanceAction,
  DashboardData,
  MutationResult,
  RemoteRiskSnapshot,
  ShiftInfo,
  TimelineEntry
} from '@shared/api'
import { formatAppIsoOffset, getAppDayOfWeek } from '@shared/app-time'
import { appConfig } from '../config/app-config'
import { getPool } from '../db/sql'
import { formatSqlDate, formatSqlDateTime, formatSqlStartOfDay, parseSqlDateTime } from './sql-datetime'
import { RemoteRiskService, type RemoteRiskPolicyMode, type RemoteRiskState } from './remote-risk-service'

export interface ShiftRecord {
  shiftName: string
  shiftCode: string | null
  onduty: string
  offduty: string
  onLunch: string | null
  offLunch: string | null
  workingMinutes: number | null
  lateGraceMinutes: number
  isAbsentSaturday: boolean
  isAbsentSunday: boolean
}

export interface PunchRecord {
  time: Date
  type: 'I' | 'O' | null
}

export interface AttendanceRepository {
  getShiftForUser(userEnrollNumber: number, date: Date): Promise<ShiftRecord | null>
  getPunchesForDate(userEnrollNumber: number, date: Date): Promise<PunchRecord[]>
  getLatestPunch(userEnrollNumber: number): Promise<PunchRecord | null>
  insertPunch(args: { userEnrollNumber: number; type: 'I' | 'O'; time: Date }): Promise<void>
  getRemoteRiskPolicyMode(): Promise<RemoteRiskPolicyMode>
  insertRemoteRiskAuditLog(args: {
    userEnrollNumber: number
    action: AttendanceAction
    riskLevel: RemoteRiskState['level']
    policyMode: RemoteRiskPolicyMode
    status: 'allowed' | 'blocked'
    detectedProcessesJson: string
    activeSignalsJson: string
    reason: string | null
    checkedAt: Date
  }): Promise<void>
}

const formatTime = (date: Date): string => formatSqlDateTime(date).slice(11, 16)

const formatWorkingHours = (workingMinutes: number | null): string => {
  if (!workingMinutes) return '--'
  const hours = Math.floor(workingMinutes / 60)
  const minutes = workingMinutes % 60
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

const resolveShiftDayId = (date: Date): number => {
  const day = getAppDayOfWeek(date)
  return day === 0 ? 7 : day
}

export class AttendanceService {
  static readonly timelineMeta: Array<Pick<TimelineEntry, 'key' | 'label'>> = [
    { key: 'morning-in', label: 'Vào sáng' },
    { key: 'lunch-out', label: 'Ra trưa' },
    { key: 'afternoon-in', label: 'Vào chiều' },
    { key: 'day-out', label: 'Ra chiều' }
  ]

  constructor(
    private readonly repository: AttendanceRepository,
    private readonly remoteRiskService: Pick<RemoteRiskService, 'evaluate'> = new RemoteRiskService()
  ) {}

  static buildTimeline(times: Date[]): TimelineEntry[] {
    const sortedTimes = [...times].sort((left, right) => left.getTime() - right.getTime())

    return AttendanceService.timelineMeta.map((slot, index) => ({
      ...slot,
      time: sortedTimes[index] ? formatTime(sortedTimes[index]) : '--:--',
      completed: Boolean(sortedTimes[index])
    }))
  }

  static isDuplicatePunch(args: {
    lastPunchAt: Date | null
    nextPunchAt: Date
    lastPunchType: 'I' | 'O' | null
    nextPunchType: 'I' | 'O'
  }): boolean {
    if (!args.lastPunchAt || !args.lastPunchType) return false
    if (args.lastPunchType !== args.nextPunchType) return false
    return Math.abs(args.nextPunchAt.getTime() - args.lastPunchAt.getTime()) < 60_000
  }

  async getDashboard(userEnrollNumber: number): Promise<DashboardData> {
    const today = new Date()
    const [shift, punches, policyMode] = await Promise.all([
      this.repository.getShiftForUser(userEnrollNumber, today),
      this.repository.getPunchesForDate(userEnrollNumber, today),
      this.repository.getRemoteRiskPolicyMode()
    ])
    const rawRemoteRisk =
      policyMode === 'block_high_risk' ? await this.remoteRiskService.evaluate().catch(() => null) : null

    const sortedPunches = punches
      .map((item) => item.time)
      .sort((left, right) => left.getTime() - right.getTime())

    const nextAction: AttendanceAction = sortedPunches.length % 2 === 0 ? 'check-in' : 'check-out'

    let remoteRisk: ReturnType<typeof serializeRemoteRisk> | null = null
    if (rawRemoteRisk) {
      remoteRisk = serializeRemoteRisk(rawRemoteRisk)
      if (policyMode !== 'block_high_risk') {
        remoteRisk.blocking = false
      }
    }

    return {
      shift: shift ? this.serializeShift(shift) : null,
      timeline: AttendanceService.buildTimeline(sortedPunches),
      nextAction,
      lastEventAt: sortedPunches.at(-1) ? formatAppIsoOffset(sortedPunches.at(-1)!) : null,
      connectionStatus: 'connected',
      remoteRisk
    }
  }

  async recordPunch(
    userEnrollNumber: number,
    action: AttendanceAction
  ): Promise<MutationResult> {
    const type = action === 'check-in' ? 'I' : 'O'
    const now = new Date()
    const [lastPunch, policyMode, remoteRisk] = await Promise.all([
      this.repository.getLatestPunch(userEnrollNumber),
      this.repository.getRemoteRiskPolicyMode(),
      this.remoteRiskService.evaluate()
    ])

    const shouldBlock = policyMode === 'block_high_risk' && remoteRisk.blocking
    if (remoteRisk.level !== 'low') {
      await this.repository.insertRemoteRiskAuditLog({
        userEnrollNumber,
        action,
        riskLevel: remoteRisk.level,
        policyMode,
        status: shouldBlock ? 'blocked' : 'allowed',
        detectedProcessesJson: JSON.stringify(remoteRisk.detectedProcesses),
        activeSignalsJson: JSON.stringify(remoteRisk.activeSignals),
        reason: remoteRisk.reason,
        checkedAt: now
      })
    }

    if (shouldBlock) {
      return {
        ok: false,
        message: 'Không thể chấm công khi đang phát hiện điều khiển từ xa hoạt động'
      }
    }

    if (
      AttendanceService.isDuplicatePunch({
        lastPunchAt: lastPunch?.time ?? null,
        nextPunchAt: now,
        lastPunchType: lastPunch?.type ?? null,
        nextPunchType: type
      })
    ) {
      return {
        ok: false,
        message: 'Bạn vừa chấm công, vui lòng thử lại sau'
      }
    }

    await this.repository.insertPunch({
      userEnrollNumber,
      type,
      time: now
    })

    return {
      ok: true,
      message: action === 'check-in' ? 'Chấm công vào thành công' : 'Chấm công ra thành công'
    }
  }

  private serializeShift(record: ShiftRecord): ShiftInfo {
    return {
      shiftName: record.shiftName,
      shiftCode: record.shiftCode,
      onduty: record.onduty,
      offduty: record.offduty,
      onLunch: record.onLunch,
      offLunch: record.offLunch,
      workingHours: formatWorkingHours(record.workingMinutes),
      lateGraceMinutes: record.lateGraceMinutes
    }
  }
}

const serializeRemoteRisk = (state: RemoteRiskState): RemoteRiskSnapshot => ({
  level: state.level,
  blocking: state.blocking,
  message: state.reason,
  detectedProcesses: state.detectedProcesses.map((process) => process.name),
  activeSignals: state.activeSignals
})

export class SqlAttendanceRepository implements AttendanceRepository {
  async getShiftForUser(userEnrollNumber: number, date: Date): Promise<ShiftRecord | null> {
    const pool = await getPool('wise-eye')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)
    request.input('dayId', resolveShiftDayId(date))

    const result = await request.query(`
      SELECT TOP 1
        s.SchName AS ShiftName,
        sh.ShiftCode,
        sh.Onduty,
        sh.Offduty,
        sh.OnLunch,
        sh.OffLunch,
        sh.WorkingTime,
        ISNULL(sh.LateGrace, 0) AS LateGrace,
        CAST(ISNULL(s.IsAbsentSat, 0) AS bit) AS IsAbsentSaturday,
        CAST(ISNULL(s.IsAbsentSun, 0) AS bit) AS IsAbsentSunday
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
      WHERE u.UserEnrollNumber = @userEnrollNumber
    `)

    const row = result.recordset[0]
    if (!row) return null

    return {
      shiftName: row.ShiftName ?? 'Ca mặc định',
      shiftCode: row.ShiftCode ?? null,
      onduty: row.Onduty ?? '--:--',
      offduty: row.Offduty ?? '--:--',
      onLunch: row.OnLunch ?? null,
      offLunch: row.OffLunch ?? null,
      workingMinutes: row.WorkingTime ?? null,
      lateGraceMinutes: row.LateGrace ?? 0,
      isAbsentSaturday: row.IsAbsentSaturday,
      isAbsentSunday: row.IsAbsentSunday
    }
  }

  async getPunchesForDate(userEnrollNumber: number, date: Date): Promise<PunchRecord[]> {
    const pool = await getPool('wise-eye')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)
    request.input('date', formatSqlDate(date))

    const result = await request.query(`
      SELECT
        CONVERT(varchar(19), TimeStr, 120) AS TimeStrText,
        OriginType
      FROM dbo.CheckInOut
      WHERE UserEnrollNumber = @userEnrollNumber
        AND CONVERT(varchar(10), TimeDate, 23) = @date
      ORDER BY TimeStr ASC
    `)

    return result.recordset.map((row) => ({
      time: parseSqlDateTime(row.TimeStrText),
      type: row.OriginType === 'I' || row.OriginType === 'O' ? row.OriginType : null
    }))
  }

  async getLatestPunch(userEnrollNumber: number): Promise<PunchRecord | null> {
    const pool = await getPool('wise-eye')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)

    const result = await request.query(`
      SELECT TOP 1
        CONVERT(varchar(19), TimeStr, 120) AS TimeStrText,
        OriginType
      FROM dbo.CheckInOut
      WHERE UserEnrollNumber = @userEnrollNumber
      ORDER BY TimeStr DESC
    `)

    const row = result.recordset[0]
    if (!row) return null

    return {
      time: parseSqlDateTime(row.TimeStrText),
      type: row.OriginType === 'I' || row.OriginType === 'O' ? row.OriginType : null
    }
  }

  async insertPunch(args: { userEnrollNumber: number; type: 'I' | 'O'; time: Date }): Promise<void> {
    const pool = await getPool('wise-eye')
    const request = pool.request()
    request.input('userEnrollNumber', args.userEnrollNumber)
    request.input('timeStr', formatSqlDateTime(args.time))
    request.input('timeDate', formatSqlStartOfDay(args.time))
    request.input('originType', args.type)
    request.input('source', 'PC')
    request.input('machineNo', appConfig.sql.machineNo)
    request.input('workCode', 0)

    await request.query(`
      INSERT INTO dbo.CheckInOut (
        UserEnrollNumber,
        TimeStr,
        TimeDate,
        OriginType,
        Source,
        MachineNo,
        WorkCode
      )
      VALUES (
        @userEnrollNumber,
        CONVERT(datetime, @timeStr, 120),
        CONVERT(smalldatetime, @timeDate, 120),
        @originType,
        @source,
        @machineNo,
        @workCode
      )
    `)
  }

  async getRemoteRiskPolicyMode(): Promise<RemoteRiskPolicyMode> {
    const appPool = await getPool('app')
    const result = await appPool.request().query(`
      SELECT TOP 1 setting_value
      FROM dbo.app_settings
      WHERE setting_key = N'remote_risk_guard_mode'
    `)

    return result.recordset[0]?.setting_value === 'block_high_risk' ? 'block_high_risk' : 'audit_only'
  }

  async insertRemoteRiskAuditLog(args: {
    userEnrollNumber: number
    action: AttendanceAction
    riskLevel: RemoteRiskState['level']
    policyMode: RemoteRiskPolicyMode
    status: 'allowed' | 'blocked'
    detectedProcessesJson: string
    activeSignalsJson: string
    reason: string | null
    checkedAt: Date
  }): Promise<void> {
    const appPool = await getPool('app')
    const request = appPool.request()
    request.input('userEnrollNumber', args.userEnrollNumber)
    request.input('action', args.action)
    request.input('riskLevel', args.riskLevel)
    request.input('policyMode', args.policyMode)
    request.input('status', args.status)
    request.input('detectedProcessesJson', args.detectedProcessesJson)
    request.input('activeSignalsJson', args.activeSignalsJson)
    request.input('reason', args.reason)
    request.input('checkedAt', formatSqlDateTime(args.checkedAt))

    await request.query(`
      INSERT INTO dbo.remote_risk_punch_audit_logs (
        user_enroll_number,
        punch_action,
        risk_level,
        policy_mode,
        status,
        detected_processes_json,
        active_signals_json,
        reason,
        checked_at
      )
      VALUES (
        @userEnrollNumber,
        @action,
        @riskLevel,
        @policyMode,
        @status,
        @detectedProcessesJson,
        @activeSignalsJson,
        @reason,
        CONVERT(datetime2, @checkedAt, 120)
      )
    `)
  }
}
