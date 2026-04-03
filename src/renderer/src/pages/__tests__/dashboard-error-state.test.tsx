import { act } from 'react'
import { render, screen } from '@testing-library/react'
import { DashboardPage } from '../dashboard-page'

const EMPTY_HISTORY = {
  filter: { month: null, startDate: '', endDate: '', page: 1, pageSize: 5 },
  stats: { totalWorkingDays: 0, onTimeRate: 0, totalOvertimeHours: 0, absences: 0 },
  records: [],
  total: 0
}

const sqlUnavailableMessage = /Không thể chấm công khi ứng dụng chưa kết nối được SQL Server nội bộ/i
const sqlLoadErrorMessage = /Không thể kết nối SQL Server/i
const remoteRiskMessage = /Phát hiện điều khiển từ xa đang hoạt động/i
const heroTitle = /Hệ thống thời gian thực/i
const punchInButton = { name: /Chấm công vào/i }

describe('DashboardPage error state', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a friendly SQL/network error message when dashboard loading fails', async () => {
    window.ccpro = {
      auth: undefined as never,
      admin: undefined as never,
      adminUsers: undefined as never,
      attendance: {
        getDashboard: vi.fn(async () => {
          throw new Error('Failed to connect to 10.60.1.4:1433')
        }),
        checkIn: vi.fn(),
        checkOut: vi.fn(),
        getHistory: vi.fn(async () => EMPTY_HISTORY)
      },
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    }

    render(<DashboardPage />)

    expect(await screen.findByText(sqlLoadErrorMessage)).toBeInTheDocument()
    expect(screen.getByRole('button', punchInButton)).toBeDisabled()
    expect(screen.getByText(sqlUnavailableMessage)).toBeInTheDocument()
  })

  it('keeps punching available when remote-risk is suspicious but not blocked', async () => {
    window.ccpro = {
      auth: undefined as never,
      admin: undefined as never,
      adminUsers: undefined as never,
      attendance: {
        getDashboard: vi.fn(async () => ({
          shift: null,
          timeline: [],
          nextAction: 'check-in',
          lastEventAt: null,
          connectionStatus: 'connected',
          remoteRisk: {
            level: 'medium',
            blocking: false,
            message: 'Phát hiện tín hiệu điều khiển từ xa đáng ngờ',
            detectedProcesses: ['AnyDesk.exe'],
            activeSignals: ['foreground']
          }
        })),
        checkIn: vi.fn(async () => ({ ok: true, message: 'ok' })),
        checkOut: vi.fn(async () => ({ ok: true, message: 'ok' })),
        getHistory: vi.fn(async () => EMPTY_HISTORY)
      },
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    }

    render(<DashboardPage />)

    await screen.findByText(heroTitle)
    expect(screen.queryByText(/điều khiển từ xa đáng ngờ/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', punchInButton)).not.toBeDisabled()
  })

  it('disables the punch button when remote-risk is blocking', async () => {
    window.ccpro = {
      auth: undefined as never,
      admin: undefined as never,
      adminUsers: undefined as never,
      attendance: {
        getDashboard: vi.fn(async () => ({
          shift: null,
          timeline: [],
          nextAction: 'check-in',
          lastEventAt: null,
          connectionStatus: 'connected',
          remoteRisk: {
            level: 'high',
            blocking: true,
            message: 'Phát hiện điều khiển từ xa đang hoạt động',
            detectedProcesses: ['UltraViewer.exe'],
            activeSignals: ['network-sustained']
          }
        })),
        checkIn: vi.fn(async () => ({ ok: true, message: 'ok' })),
        checkOut: vi.fn(async () => ({ ok: true, message: 'ok' })),
        getHistory: vi.fn(async () => EMPTY_HISTORY)
      },
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    }

    render(<DashboardPage />)

    expect(await screen.findByText(remoteRiskMessage)).toBeInTheDocument()
    expect(screen.getByRole('button', punchInButton)).toBeDisabled()
  })

  it('refreshes dashboard remote-risk state while the page stays open', async () => {
    vi.useFakeTimers()

    const getDashboard = vi
      .fn()
      .mockResolvedValueOnce({
        shift: null,
        timeline: [],
        nextAction: 'check-in',
        lastEventAt: null,
        connectionStatus: 'connected',
        remoteRisk: null
      })
      .mockResolvedValue({
        shift: null,
        timeline: [],
        nextAction: 'check-in',
        lastEventAt: null,
        connectionStatus: 'connected',
        remoteRisk: {
          level: 'high',
          blocking: true,
          message: 'Phát hiện điều khiển từ xa đang hoạt động',
          detectedProcesses: ['UltraViewer.exe'],
          activeSignals: ['network-sustained']
        }
      })

    window.ccpro = {
      auth: undefined as never,
      admin: undefined as never,
      adminUsers: undefined as never,
      attendance: {
        getDashboard,
        checkIn: vi.fn(async () => ({ ok: true, message: 'ok' })),
        checkOut: vi.fn(async () => ({ ok: true, message: 'ok' })),
        getHistory: vi.fn(async () => EMPTY_HISTORY)
      },
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    }

    render(<DashboardPage />)
    await act(async () => {})

    const button = screen.getByRole('button', punchInButton)
    expect(button).not.toBeDisabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    expect(screen.getByText(remoteRiskMessage)).toBeInTheDocument()
    expect(button).toBeDisabled()
  })

  it('disables the punch button and shows a dedicated SQL/LAN message when connection is unavailable', async () => {
    window.ccpro = {
      auth: undefined as never,
      admin: undefined as never,
      adminUsers: undefined as never,
      attendance: {
        getDashboard: vi.fn(async () => ({
          shift: null,
          timeline: [],
          nextAction: 'check-in',
          lastEventAt: null,
          connectionStatus: 'disconnected',
          remoteRisk: null
        })),
        checkIn: vi.fn(async () => ({ ok: true, message: 'ok' })),
        checkOut: vi.fn(async () => ({ ok: true, message: 'ok' })),
        getHistory: vi.fn(async () => EMPTY_HISTORY)
      },
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    }

    render(<DashboardPage />)

    expect(await screen.findByText(sqlUnavailableMessage)).toBeInTheDocument()
    expect(screen.getByRole('button', punchInButton)).toBeDisabled()
    expect(screen.getByText(sqlUnavailableMessage)).toBeInTheDocument()
  })

  it('keeps SQL/LAN and remote-risk messages separate when both conditions are present', async () => {
    window.ccpro = {
      auth: undefined as never,
      admin: undefined as never,
      adminUsers: undefined as never,
      attendance: {
        getDashboard: vi.fn(async () => ({
          shift: null,
          timeline: [],
          nextAction: 'check-in',
          lastEventAt: null,
          connectionStatus: 'disconnected',
          remoteRisk: {
            level: 'high',
            blocking: true,
            message: 'Phát hiện điều khiển từ xa đang hoạt động',
            detectedProcesses: ['UltraViewer.exe'],
            activeSignals: ['network-sustained']
          }
        })),
        checkIn: vi.fn(async () => ({ ok: true, message: 'ok' })),
        checkOut: vi.fn(async () => ({ ok: true, message: 'ok' })),
        getHistory: vi.fn(async () => EMPTY_HISTORY)
      },
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    }

    render(<DashboardPage />)

    expect(await screen.findByText(sqlUnavailableMessage)).toBeInTheDocument()
    expect(screen.getByText(remoteRiskMessage)).toBeInTheDocument()
    expect(screen.getByRole('button', punchInButton)).toBeDisabled()
  })
})
