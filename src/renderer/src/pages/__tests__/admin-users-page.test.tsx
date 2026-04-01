import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AdminUsersPage } from '../admin-users-page'

const buildUser = () => ({
  userEnrollNumber: 18,
  employeeCode: 'E0112599',
  fullName: 'Phan Thuy',
  department: 'IT',
  scheduleName: 'Hành chính',
  wiseEyeEnabled: true,
  appActive: true,
  hasAppAccount: true,
  mustChangePassword: false
})

const buildAdminSession = () => ({
  authenticated: true,
  mustChangePassword: false,
  admin: {
    id: 1,
    username: 'admin',
    displayName: 'Admin',
    role: 'super_admin'
  }
})

describe('AdminUsersPage', () => {
  it('renders the managed user list', async () => {
    window.ccpro = {
      admin: {
        getSession: vi.fn(async () => buildAdminSession()),
        login: undefined as never,
        logout: vi.fn(async () => undefined),
        bootstrap: undefined as never,
        changePassword: undefined as never,
        listAdmins: undefined as never,
        resetPassword: undefined as never
      },
      adminUsers: {
        listUsers: vi.fn(async () => ({ users: [buildUser()] })),
        setUserActiveState: vi.fn(async () => ({ ok: true, message: 'ok' })),
        resetUserPassword: vi.fn(async () => ({ ok: true, message: 'ok' }))
      },
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as typeof window.ccpro

    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <AdminUsersPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Quản lý ứng dụng')).toBeInTheDocument()
    expect(await screen.findByText('Phan Thuy')).toBeInTheDocument()
    expect(screen.getByText('E0112599')).toBeInTheDocument()
    expect(screen.getByText('Hoạt động')).toBeInTheDocument()
  })

  it('deactivates a user after confirmation and refreshes the list', async () => {
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ users: [buildUser()] })
      .mockResolvedValue({ users: [{ ...buildUser(), appActive: false }] })
    const setUserActiveState = vi.fn(async () => ({
      ok: true,
      message: 'Đã vô hiệu hóa tài khoản ứng dụng'
    }))

    window.ccpro = {
      admin: {
        getSession: vi.fn(async () => buildAdminSession()),
        login: undefined as never,
        logout: vi.fn(async () => undefined),
        bootstrap: undefined as never,
        changePassword: undefined as never,
        listAdmins: undefined as never,
        resetPassword: undefined as never
      },
      adminUsers: {
        listUsers,
        setUserActiveState,
        resetUserPassword: vi.fn(async () => ({ ok: true, message: 'ok' }))
      },
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as typeof window.ccpro

    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <AdminUsersPage />
      </MemoryRouter>
    )

    fireEvent.click(await screen.findByTitle('Vô hiệu hóa tài khoản'))
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }))

    await waitFor(() => {
      expect(setUserActiveState).toHaveBeenCalledWith({
        userEnrollNumber: 18,
        isActive: false
      })
    })

    expect(await screen.findByText('Đã vô hiệu hóa tài khoản ứng dụng')).toBeInTheDocument()
  })

  it('submits a temporary password reset for the selected user', async () => {
    const resetUserPassword = vi.fn(async () => ({
      ok: true,
      message: 'Đã reset mật khẩu tạm và yêu cầu đổi lại ở lần đăng nhập tiếp theo'
    }))

    window.ccpro = {
      admin: {
        getSession: vi.fn(async () => buildAdminSession()),
        login: undefined as never,
        logout: vi.fn(async () => undefined),
        bootstrap: undefined as never,
        changePassword: undefined as never,
        listAdmins: undefined as never,
        resetPassword: undefined as never
      },
      adminUsers: {
        listUsers: vi.fn(async () => ({ users: [buildUser()] })),
        setUserActiveState: vi.fn(async () => ({ ok: true, message: 'ok' })),
        resetUserPassword
      },
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as typeof window.ccpro

    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <AdminUsersPage />
      </MemoryRouter>
    )

    fireEvent.click(await screen.findByTitle('Reset mật khẩu'))
    fireEvent.change(await screen.findByPlaceholderText('Nhập mật khẩu tạm (>= 6 ký tự)'), {
      target: { value: 'Temp@123' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận reset' }))

    await waitFor(() => {
      expect(resetUserPassword).toHaveBeenCalledWith({
        userEnrollNumber: 18,
        temporaryPassword: 'Temp@123'
      })
    })
  })

  it('falls back safely when the preload bridge does not expose adminUsers yet', async () => {
    window.ccpro = {
      admin: {
        getSession: vi.fn(async () => buildAdminSession()),
        login: undefined as never,
        logout: vi.fn(async () => undefined),
        bootstrap: undefined as never,
        changePassword: undefined as never,
        listAdmins: undefined as never,
        resetPassword: undefined as never
      },
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as typeof window.ccpro

    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <AdminUsersPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Quản lý ứng dụng')).toBeInTheDocument()
    expect(
      screen.getByText('Bản app hiện tại chưa hỗ trợ quản lý người dùng. Hãy mở lại app sau khi cập nhật build mới.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tìm kiếm' })).toBeDisabled()
  })
})
