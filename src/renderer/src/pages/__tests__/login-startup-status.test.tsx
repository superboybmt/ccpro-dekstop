import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '@renderer/providers/auth-provider'
import { LoginPage } from '../login-page'
import { AdminLoginPage } from '../admin-login-page'

describe('login startup status', () => {
  it('shows startup diagnostics on the employee login page', async () => {
    window.ccpro = {
      auth: {
        getSession: vi.fn(async () => ({
          authenticated: false,
          mustChangePassword: false,
          user: null
        })),
        login: vi.fn(async () => ({
          ok: false,
          requiresPasswordChange: false
        })),
        changePassword: vi.fn(),
        logout: vi.fn()
      },
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never,
      admin: {
        getSession: vi.fn(async () => ({
          authenticated: false,
          mustChangePassword: false,
          admin: null
        })),
        login: vi.fn(),
        changePassword: vi.fn(),
        listAdmins: vi.fn(),
        resetPassword: vi.fn(),
        logout: vi.fn(),
        bootstrap: vi.fn()
      },
      adminUsers: undefined as never,
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      adminShifts: undefined as never,
      app: {
        getStartupStatus: vi.fn(async () => ({
          status: 'error' as const,
          category: 'missing-config' as const,
          message: 'Missing required environment variable: WISEEYE_SQL_PASSWORD'
        })),
        checkForUpdates: vi.fn(),
        downloadVerifiedUpdate: vi.fn(),
        openExternal: vi.fn(),
        onUpdateAvailable: vi.fn()
      }
    }

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    )

    expect(
      await screen.findByText('Missing required environment variable: WISEEYE_SQL_PASSWORD')
    ).toBeInTheDocument()
  })

  it('shows startup diagnostics on the admin login page', async () => {
    window.ccpro = {
      auth: {
        getSession: vi.fn(async () => ({
          authenticated: false,
          mustChangePassword: false,
          user: null
        })),
        login: vi.fn(),
        changePassword: vi.fn(),
        logout: vi.fn()
      },
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never,
      admin: {
        getSession: vi.fn(async () => ({
          authenticated: false,
          mustChangePassword: false,
          admin: null
        })),
        login: vi.fn(async () => ({ ok: false })),
        changePassword: vi.fn(),
        listAdmins: vi.fn(),
        resetPassword: vi.fn(),
        logout: vi.fn(),
        bootstrap: vi.fn()
      },
      adminUsers: undefined as never,
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      adminShifts: undefined as never,
      app: {
        getStartupStatus: vi.fn(async () => ({
          status: 'error' as const,
          category: 'sql-connectivity' as const,
          message: 'Failed to connect to 10.60.1.4:1433'
        })),
        checkForUpdates: vi.fn(),
        downloadVerifiedUpdate: vi.fn(),
        openExternal: vi.fn(),
        onUpdateAvailable: vi.fn()
      }
    }

    render(
      <MemoryRouter initialEntries={['/admin/login']}>
        <AdminLoginPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Failed to connect to 10.60.1.4:1433')).toBeInTheDocument()
  })
})
