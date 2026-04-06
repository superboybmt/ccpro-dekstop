import { render, screen } from '@testing-library/react'
import { DashboardPage } from '../dashboard-page'

const EMPTY_HISTORY = {
  filter: { month: null, startDate: '', endDate: '', page: 1, pageSize: 5 },
  stats: { totalWorkingDays: 0, onTimeRate: 0, lateDays: 0, avgWorkingHoursPerDay: 0 },
  records: [],
  total: 0
}

describe('DashboardPage sync guard', () => {
  it('disables punch button while device sync is running', async () => {
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
          deviceSyncStatus: 'syncing',
          remoteRisk: null
        })),
        checkIn: vi.fn(async () => ({ ok: true, message: 'ok' })),
        checkOut: vi.fn(async () => ({ ok: true, message: 'ok' })),
        getHistory: vi.fn(async () => EMPTY_HISTORY)
      },
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as unknown as typeof window.ccpro

    render(<DashboardPage />)

    const punchButton = await screen.findByRole('button', { name: /Chấm công vào/i })
    expect(punchButton).toBeDisabled()
  })
})
