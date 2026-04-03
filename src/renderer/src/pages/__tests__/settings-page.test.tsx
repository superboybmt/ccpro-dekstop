import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from '../settings-page'

vi.mock('@renderer/providers/auth-provider', () => ({
  useAuth: () => ({
    logout: vi.fn(async () => undefined),
    markPasswordChanged: vi.fn()
  })
}))

describe('SettingsPage', () => {
  it('does not render a duplicate logout button', async () => {
    window.ccpro = {
      auth: {
        changePassword: vi.fn(async () => ({
          ok: true,
          message: 'Doi mat khau thanh cong'
        }))
      },
      admin: undefined as never,
      adminUsers: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
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
          lastSyncAt: '2026-03-31T00:00:00.000Z'
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
      }
    } as unknown as typeof window.ccpro

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    )

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /hệ thống/i }))

    await screen.findByText('Phiên bản')

    expect(screen.queryByRole('button', { name: /đăng xuất/i })).not.toBeInTheDocument()
  })
})
