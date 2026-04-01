import { describe, expect, it } from 'vitest'
import { AttendanceService } from '../attendance-service'

describe('AttendanceService', () => {
  it('maps sequential events into four dashboard slots', () => {
    const timeline = AttendanceService.buildTimeline([
      new Date('2026-03-30T07:55:00'),
      new Date('2026-03-30T12:03:00'),
      new Date('2026-03-30T13:01:00')
    ])

    expect(timeline[0]?.time).toBe('07:55')
    expect(timeline[1]?.time).toBe('12:03')
    expect(timeline[2]?.time).toBe('13:01')
    expect(timeline[3]?.time).toBe('--:--')
  })

  it('detects duplicate punches within one minute for the same type', () => {
    const isDuplicate = AttendanceService.isDuplicatePunch({
      lastPunchAt: new Date('2026-03-30T08:00:00'),
      nextPunchAt: new Date('2026-03-30T08:00:40'),
      lastPunchType: 'I',
      nextPunchType: 'I'
    })

    expect(isDuplicate).toBe(true)
  })

  it('does not block normal punch flow when remote-risk stays low', async () => {
    const repository = {
      getShiftForUser: async () => null,
      getPunchesForDate: async () => [],
      getLatestPunch: async () => null,
      insertPunch: async () => undefined,
      insertRemoteRiskAuditLog: async () => undefined,
      getRemoteRiskPolicyMode: async () => 'block_high_risk' as const
    }
    const remoteRiskService = {
      evaluate: async () => ({
        level: 'low' as const,
        blocking: false,
        detectedProcesses: [],
        activeSignals: [],
        checkedAt: '2026-04-01T08:00:00+07:00',
        reason: null
      })
    }

    const service = new AttendanceService(repository, remoteRiskService)

    await expect(service.recordPunch(18, 'check-in')).resolves.toEqual({
      ok: true,
      message: 'Chấm công vào thành công'
    })
  })

  it('blocks punch and writes audit log when remote-risk is high and policy enforcement is enabled', async () => {
    const insertPunch = vi.fn(async () => undefined)
    const insertRemoteRiskAuditLog = vi.fn(async () => undefined)
    const repository = {
      getShiftForUser: async () => null,
      getPunchesForDate: async () => [],
      getLatestPunch: async () => null,
      insertPunch,
      insertRemoteRiskAuditLog,
      getRemoteRiskPolicyMode: async () => 'block_high_risk' as const
    }
    const remoteRiskService = {
      evaluate: async () => ({
        level: 'high' as const,
        blocking: true,
        detectedProcesses: [{ name: 'UltraViewer.exe', pid: 999 }],
        activeSignals: ['network', 'foreground'],
        checkedAt: '2026-04-01T08:00:00+07:00',
        reason: 'Phát hiện điều khiển từ xa đang hoạt động'
      })
    }

    const service = new AttendanceService(repository, remoteRiskService)

    await expect(service.recordPunch(18, 'check-in')).resolves.toEqual({
      ok: false,
      message: 'Không thể chấm công khi đang phát hiện điều khiển từ xa hoạt động'
    })

    expect(insertPunch).not.toHaveBeenCalled()
    expect(insertRemoteRiskAuditLog).toHaveBeenCalledTimes(1)
  })
})
