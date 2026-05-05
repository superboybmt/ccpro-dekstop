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
  mustChangePassword: false,
  boundHardwareId: 'hardware-1'
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
        resetUserPassword: vi.fn(async () => ({ ok: true, message: 'ok' })),
        unbindDevice: vi.fn(async () => ({ ok: true, message: 'ok' })),
        batchSetActiveState: vi.fn(async () => ({ ok: true, successCount: 1, failedCount: 0, message: 'ok' })),
        batchUnbindDevices: vi.fn(async () => ({ ok: true, successCount: 1, failedCount: 0, message: 'ok' }))
      },
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as unknown as typeof window.ccpro

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
        resetUserPassword: vi.fn(async () => ({ ok: true, message: 'ok' })),
        unbindDevice: vi.fn(async () => ({ ok: true, message: 'ok' })),
        batchSetActiveState: vi.fn(async () => ({ ok: true, successCount: 1, failedCount: 0, message: 'ok' })),
        batchUnbindDevices: vi.fn(async () => ({ ok: true, successCount: 1, failedCount: 0, message: 'ok' }))
      },
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as unknown as typeof window.ccpro

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
        resetUserPassword,
        unbindDevice: vi.fn(async () => ({ ok: true, message: 'ok' })),
        batchSetActiveState: vi.fn(async () => ({ ok: true, successCount: 1, failedCount: 0, message: 'ok' })),
        batchUnbindDevices: vi.fn(async () => ({ ok: true, successCount: 1, failedCount: 0, message: 'ok' }))
      },
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as unknown as typeof window.ccpro

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

  it('shows device binding status and lets an admin unbind the device', async () => {
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ users: [buildUser()] })
      .mockResolvedValue({ users: [{ ...buildUser(), boundHardwareId: null }] })
    const unbindDevice = vi.fn(async () => ({
      ok: true,
      message: 'Đã gỡ liên kết thiết bị của nhân viên'
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
        setUserActiveState: vi.fn(async () => ({ ok: true, message: 'ok' })),
        resetUserPassword: vi.fn(async () => ({ ok: true, message: 'ok' })),
        unbindDevice,
        batchSetActiveState: vi.fn(async () => ({ ok: true, successCount: 1, failedCount: 0, message: 'ok' })),
        batchUnbindDevices: vi.fn(async () => ({ ok: true, successCount: 1, failedCount: 0, message: 'ok' }))
      },
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as unknown as typeof window.ccpro

    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <AdminUsersPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Đã gắn thiết bị')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Gỡ liên kết thiết bị'))

    await waitFor(() => {
      expect(unbindDevice).toHaveBeenCalledWith(18)
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
    } as unknown as typeof window.ccpro

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

  it('shows bulk action bar when users are selected and executes batch deactivate', async () => {
    const batchSetActiveState = vi.fn(async () => ({
      ok: true,
      successCount: 1,
      failedCount: 0,
      message: 'Đã vô hiệu hóa 1 tài khoản'
    }))
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ users: [buildUser()] })
      .mockResolvedValue({ users: [{ ...buildUser(), appActive: false }] })

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
        setUserActiveState: vi.fn(async () => ({ ok: true, message: 'ok' })),
        resetUserPassword: vi.fn(async () => ({ ok: true, message: 'ok' })),
        unbindDevice: vi.fn(async () => ({ ok: true, message: 'ok' })),
        batchSetActiveState,
        batchUnbindDevices: vi.fn(async () => ({ ok: true, successCount: 1, failedCount: 0, message: 'ok' }))
      },
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as unknown as typeof window.ccpro

    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <AdminUsersPage />
      </MemoryRouter>
    )

    // Wait for table to load
    await screen.findByText('Phan Thuy')

    // Use the select-all checkbox in the header
    const selectAllBtn = screen.getByTitle('Chọn tất cả trang này')
    fireEvent.click(selectAllBtn)

    // Bulk action bar should appear
    expect(await screen.findByText(/Đã chọn 1 người dùng/)).toBeInTheDocument()

    // Click "Khóa tất cả"
    fireEvent.click(screen.getByText('Khóa tất cả'))

    // Confirmation dialog should appear
    expect(await screen.findByText('Khóa hàng loạt')).toBeInTheDocument()

    // Confirm
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }))

    await waitFor(() => {
      expect(batchSetActiveState).toHaveBeenCalledWith({
        userEnrollNumbers: [18],
        isActive: false
      })
    })

    expect(await screen.findByText('Đã vô hiệu hóa 1 tài khoản')).toBeInTheDocument()
  })
})
