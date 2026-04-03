import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@renderer/App'
import type { RendererApi } from '@shared/api'

const mockApi = () => {
  const dashboardResponses = [
    {
      shift: {
        shiftName: 'Ca sang',
        shiftCode: 'HC',
        onduty: '08:00',
        offduty: '17:00',
        onLunch: '12:00',
        offLunch: '13:00',
        workingHours: '8h 00m',
        lateGraceMinutes: 10
      },
      timeline: [
        { key: 'morning-in', label: 'Vao sang', time: '08:00', completed: true },
        { key: 'lunch-out', label: 'Ra trua', time: '--:--', completed: false },
        { key: 'afternoon-in', label: 'Vao chieu', time: '--:--', completed: false },
        { key: 'day-out', label: 'Ra chieu', time: '--:--', completed: false }
      ],
      nextAction: 'check-in' as const,
      lastEventAt: null,
      connectionStatus: 'connected' as const
    },
    {
      shift: {
        shiftName: 'Ca sang',
        shiftCode: 'HC',
        onduty: '08:00',
        offduty: '17:00',
        onLunch: '12:00',
        offLunch: '13:00',
        workingHours: '8h 00m',
        lateGraceMinutes: 10
      },
      timeline: [
        { key: 'morning-in', label: 'Vao sang', time: '08:01', completed: true },
        { key: 'lunch-out', label: 'Ra trua', time: '--:--', completed: false },
        { key: 'afternoon-in', label: 'Vao chieu', time: '--:--', completed: false },
        { key: 'day-out', label: 'Ra chieu', time: '--:--', completed: false }
      ],
      nextAction: 'check-out' as const,
      lastEventAt: '2026-03-31T01:01:00.000Z',
      connectionStatus: 'connected' as const
    },
    {
      shift: {
        shiftName: 'Ca sang',
        shiftCode: 'HC',
        onduty: '08:00',
        offduty: '17:00',
        onLunch: '12:00',
        offLunch: '13:00',
        workingHours: '8h 00m',
        lateGraceMinutes: 10
      },
      timeline: [
        { key: 'morning-in', label: 'Vao sang', time: '08:01', completed: true },
        { key: 'lunch-out', label: 'Ra trua', time: '--:--', completed: false },
        { key: 'afternoon-in', label: 'Vao chieu', time: '--:--', completed: false },
        { key: 'day-out', label: 'Ra chieu', time: '17:00', completed: true }
      ],
      nextAction: 'check-in' as const,
      lastEventAt: '2026-03-31T10:00:00.000Z',
      connectionStatus: 'connected' as const
    }
  ]

  return {
    auth: {
      login: vi.fn(async () => ({
        ok: true,
        requiresPasswordChange: true,
        user: {
          userEnrollNumber: 1,
          employeeCode: 'E0112599',
          fullName: 'Nguyen Van A',
          department: 'Van phong',
          hireDate: '2024-01-01',
          scheduleName: 'Hanh chanh',
          avatarInitials: 'NA'
        }
      })),
      getSession: vi.fn(async () => ({
        authenticated: false,
        mustChangePassword: false,
        user: null
      })),
      changePassword: vi.fn(async () => ({
        ok: true,
        message: 'Doi mat khau thanh cong'
      })),
      logout: vi.fn(async () => undefined)
    },
    attendance: {
      getDashboard: vi.fn(async () => dashboardResponses.shift() ?? dashboardResponses.at(-1)!),
      checkIn: vi.fn(async () => ({
        ok: true,
        message: 'Cham cong vao thanh cong'
      })),
      checkOut: vi.fn(async () => ({
        ok: true,
        message: 'Cham cong ra thanh cong'
      })),
      getHistory: vi.fn(async () => ({
        filter: {
          month: '2026-03',
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          page: 1,
          pageSize: 10
        },
        stats: {
          totalWorkingDays: 1,
          onTimeRate: 100,
          totalOvertimeHours: 0,
          absences: 0
        },
        records: [
          {
            date: '31/03/2026',
            checkIn: '08:00',
            checkOut: '17:00',
            totalHours: '9h 00m',
            status: 'on-time',
            shiftName: 'Ca sang'
          }
        ],
        total: 1
      }))
    },
    notifications: {
      list: vi.fn(async () => []),
      markRead: vi.fn(async () => undefined),
      markAllRead: vi.fn(async () => undefined)
    },
    settings: {
      getProfile: vi.fn(async () => ({
        fullName: 'Nguyen Van A',
        employeeCode: 'E0112599',
        department: 'Van phong',
        hireDate: '2024-01-01',
        scheduleName: 'Hanh chanh'
      })),
      getAppInfo: vi.fn(async () => ({
        version: '1.0.0',
        buildNumber: '1.0.0',
        connectionStatus: 'connected',
        lastSyncAt: '2026-03-30T00:00:00.000Z'
      }))
    },
    deviceSync: {
      getStatus: vi.fn(async () => ({
        status: 'ok',
        deviceIp: '10.60.1.5',
        lastSyncAt: '2026-03-31T01:00:00.000Z',
        lastRunStartedAt: '2026-03-31T00:59:50.000Z',
        lastRunFinishedAt: '2026-03-31T01:00:00.000Z',
        lastImportedCount: 2,
        lastSkippedCount: 0,
        lastError: null
      })),
      retry: vi.fn(async () => ({
        status: 'ok',
        deviceIp: '10.60.1.5',
        lastSyncAt: '2026-03-31T01:00:00.000Z',
        lastRunStartedAt: '2026-03-31T00:59:50.000Z',
        lastRunFinishedAt: '2026-03-31T01:00:00.000Z',
        lastImportedCount: 2,
        lastSkippedCount: 0,
        lastError: null
      }))
    },
    app: {
      getStartupStatus: vi.fn(async () => ({
        status: 'ready',
        category: 'unknown',
        message: null
      })),
      checkForUpdates: vi.fn(async () => null),
      downloadVerifiedUpdate: vi.fn(async () => ({ ok: true, message: 'ok', filePath: null })),
      openExternal: vi.fn(async () => undefined),
      onUpdateAvailable: vi.fn(() => () => undefined)
    }
  } as unknown as RendererApi
}

describe('attendance full flow', () => {
  it('walks through login, forced password change, dashboard punches, and history view', async () => {
    const api = mockApi()
    window.ccpro = api
    window.location.hash = '#/login'

    render(<App />)

    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Mã nhân viên'), 'E0112599')
    await user.type(screen.getByLabelText('Mật khẩu'), 'E0112599')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))

    expect(await screen.findByText(/Bạn cần đổi mật khẩu/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Bảo mật/i }))

    await user.type(screen.getByLabelText('Mật khẩu hiện tại'), 'E0112599')
    await user.type(screen.getByLabelText('Mật khẩu mới'), '654321')
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), '654321')
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))

    expect(await screen.findByRole('button', { name: /Chấm công vào/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Chấm công vào/i }))
    await user.click(await screen.findByRole('button', { name: /Chấm công ra/i }))
    await user.click(screen.getByRole('link', { name: /Lịch sử/i }))

    expect(await screen.findByText('31/03/2026')).toBeInTheDocument()

    await waitFor(() => {
      expect(api.attendance.checkIn).toHaveBeenCalledTimes(1)
      expect(api.attendance.checkOut).toHaveBeenCalledTimes(1)
      expect(api.attendance.getHistory).toHaveBeenCalled()
    })
  })
})
