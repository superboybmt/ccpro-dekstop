import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AdminAccountPage } from '../admin-account-page'

const buildAdminSession = (
  overrides?: Partial<{
    authenticated: boolean
    mustChangePassword: boolean
  }>
) => ({
  authenticated: overrides?.authenticated ?? true,
  mustChangePassword: overrides?.mustChangePassword ?? false,
  admin: {
    id: 1,
    username: 'admin',
    displayName: 'Admin',
    role: 'super_admin'
  }
})

describe('AdminAccountPage', () => {
  it('submits admin self-service password change', async () => {
    const changePassword = vi.fn(async () => ({
      ok: true,
      message: 'Đổi mật khẩu admin thành công'
    }))

    window.ccpro = {
      admin: {
        getSession: vi.fn(async () => buildAdminSession()),
        login: undefined as never,
        logout: vi.fn(async () => undefined),
        bootstrap: undefined as never,
        changePassword,
        listAdmins: vi.fn(async () => ({ admins: [] })),
        resetPassword: vi.fn(async () => ({ ok: true, message: 'ok' }))
      },
      adminUsers: undefined as never,
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as unknown as typeof window.ccpro

    render(
      <MemoryRouter initialEntries={['/admin/account']}>
        <AdminAccountPage />
      </MemoryRouter>
    )

    fireEvent.change(await screen.findByLabelText('Mật khẩu hiện tại'), {
      target: { value: 'OldSecret@123' }
    })
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), {
      target: { value: 'NewSecret@123' }
    })
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), {
      target: { value: 'NewSecret@123' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu admin' }))

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: 'OldSecret@123',
        newPassword: 'NewSecret@123',
        confirmPassword: 'NewSecret@123'
      })
    })
  })

  it('shows a forced password change warning when the admin session requires it', async () => {
    window.ccpro = {
      admin: {
        getSession: vi.fn(async () => buildAdminSession({ mustChangePassword: true })),
        login: undefined as never,
        logout: vi.fn(async () => undefined),
        bootstrap: undefined as never,
        changePassword: vi.fn(async () => ({ ok: true, message: 'ok' })),
        listAdmins: vi.fn(async () => ({ admins: [] })),
        resetPassword: vi.fn(async () => ({ ok: true, message: 'ok' }))
      },
      adminUsers: undefined as never,
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as unknown as typeof window.ccpro

    render(
      <MemoryRouter initialEntries={['/admin/account?forcePasswordChange=1']}>
        <AdminAccountPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Bạn cần đổi lại mật khẩu admin trước khi tiếp tục.')).toBeInTheDocument()
  })

  it('allows resetting another admin password from the account page', async () => {
    const resetPassword = vi.fn(async () => ({
      ok: true,
      message: 'Đã reset mật khẩu admin tạm và yêu cầu đổi lại ở lần đăng nhập tiếp theo'
    }))

    window.ccpro = {
      admin: {
        getSession: vi.fn(async () => buildAdminSession()),
        login: undefined as never,
        logout: vi.fn(async () => undefined),
        bootstrap: undefined as never,
        changePassword: vi.fn(async () => ({ ok: true, message: 'ok' })),
        listAdmins: vi.fn(async () => ({
          admins: [
            {
              id: 1,
              username: 'admin',
              displayName: 'Admin',
              role: 'super_admin',
              isActive: true,
              mustChangePassword: false
            },
            {
              id: 2,
              username: 'ops-admin',
              displayName: 'Ops Admin',
              role: 'admin',
              isActive: true,
              mustChangePassword: false
            }
          ]
        })),
        resetPassword
      },
      adminUsers: undefined as never,
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as unknown as typeof window.ccpro

    render(
      <MemoryRouter initialEntries={['/admin/account']}>
        <AdminAccountPage />
      </MemoryRouter>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Reset ops-admin' }))
    fireEvent.change(screen.getByLabelText('Mật khẩu tạm cho admin'), {
      target: { value: 'Temp@123' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận reset admin' }))

    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith({
        adminId: 2,
        temporaryPassword: 'Temp@123'
      })
    })
  })
})
