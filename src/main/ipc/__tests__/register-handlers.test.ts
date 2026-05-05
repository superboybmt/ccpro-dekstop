import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()
const shellOpenExternalMock = vi.fn(async () => undefined)
const authLoginMock = vi.fn(async () => ({ ok: false, requiresPasswordChange: false }))
const getHardwareIdMock = vi.fn(async () => 'hardware-1')
const machineConfigGetMock = vi.fn(async () => ({ stateMode: 2, schedule: [] }))
const adminUsersListMock = vi.fn(async () => ({ users: [] }))
const setUserActiveStateMock = vi.fn(async () => ({
  ok: true,
  message: 'Đã vô hiệu hóa tài khoản ứng dụng'
}))
const resetUserPasswordMock = vi.fn(async () => ({
  ok: true,
  message: 'Đã reset mật khẩu tạm và yêu cầu đổi lại ở lần đăng nhập tiếp theo'
}))
const unbindDeviceMock = vi.fn(async () => ({
  ok: true,
  message: 'Đã gỡ liên kết thiết bị của nhân viên'
}))
const batchSetActiveStateMock = vi.fn(async () => ({
  ok: true,
  successCount: 2,
  failedCount: 0,
  message: 'Đã vô hiệu hóa 2 tài khoản'
}))
const batchUnbindDevicesMock = vi.fn(async () => ({
  ok: true,
  successCount: 2,
  failedCount: 0,
  message: 'Đã gỡ liên kết thiết bị của 2 nhân viên'
}))
const changeAdminPasswordMock = vi.fn(async () => ({
  ok: true,
  message: 'Đổi mật khẩu admin thành công'
}))
const resetAdminPasswordMock = vi.fn(async () => ({
  ok: true,
  message: 'Đã reset mật khẩu admin tạm và yêu cầu đổi lại ở lần đăng nhập tiếp theo'
}))
const listAdminsMock = vi.fn(async () => ({ admins: [] }))
const saveRemoteRiskPolicyMock = vi.fn(async (policy) => ({
  ok: true,
  message: 'Đã lưu cấu hình chặn điều khiển từ xa',
  mode: policy.mode
}))
const getDeviceBindingEnabledMock = vi.fn(async () => false)
const saveDeviceBindingEnabledMock = vi.fn(async (enabled: boolean) => ({
  ok: true,
  message: enabled ? 'Đã bật ràng buộc thiết bị đăng nhập' : 'Đã tắt ràng buộc thiết bị đăng nhập'
}))
const checkForUpdatesMock = vi.fn(async () => null)
const downloadVerifiedUpdateMock = vi.fn(async () => ({
  ok: true,
  message: 'Đã tải và mở bản cập nhật đã xác thực.',
  filePath: 'E:/temp/CCPro-Portable-1.0.4.exe'
}))

let adminSession = {
  authenticated: false,
  mustChangePassword: false,
  admin: null as null | { id: number; username: string; displayName: string; role: string }
}
let userSession = {
  authenticated: false,
  mustChangePassword: false,
  user: null as null | {
    userEnrollNumber: number
    employeeCode: string
    fullName: string
    department: string | null
    hireDate: string | null
    scheduleName: string | null
    avatarInitials: string
  }
}

vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0',
    getBuildVersion: () => '1.0.0'
  },
  shell: {
    openExternal: shellOpenExternalMock
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler)
    })
  }
}))

vi.mock('../../session-store', () => ({
  SessionStore: class {
    getSession() {
      return userSession
    }

    setSession(user: NonNullable<typeof userSession.user>, mustChangePassword: boolean) {
      userSession = {
        authenticated: true,
        mustChangePassword,
        user
      }
    }
    touch() {}
    completePasswordChange() {}
    clear() {
      userSession = { authenticated: false, mustChangePassword: false, user: null }
    }

    getAdminSession() {
      return adminSession
    }

    setAdminSession() {}
    touchAdmin() {}
    completeAdminPasswordChange() {}
    clearAdmin() {}
  }
}))

vi.mock('../../db/sql', () => ({
  getConnectionStatus: vi.fn(async () => 'connected')
}))

vi.mock('../../services/auth-service', () => ({
  AuthService: class {
    login = authLoginMock
    changePassword = vi.fn(async () => ({ ok: true, message: 'ok' }))
  },
  SqlAuthRepository: class {}
}))

vi.mock('../../services/hardware-id', () => ({
  getHardwareId: getHardwareIdMock
}))

vi.mock('../../services/admin-auth-service', () => ({
  AdminAuthService: class {
    login = vi.fn(async () => ({ ok: false }))
    bootstrapFirstAdmin = vi.fn(async () => ({ ok: true, message: 'ok' }))
    changePassword = changeAdminPasswordMock
    resetPassword = resetAdminPasswordMock
    listAdmins = listAdminsMock
  },
  SqlAdminAuthRepository: class {}
}))

vi.mock('../../services/admin-user-management-service', () => ({
  AdminUserManagementService: class {
    listUsers = adminUsersListMock
    setUserActiveState = setUserActiveStateMock
    resetUserPassword = resetUserPasswordMock
    unbindDevice = unbindDeviceMock
    batchSetUserActiveState = batchSetActiveStateMock
    batchUnbindDevices = batchUnbindDevicesMock
  },
  SqlAdminUserManagementRepository: class {}
}))

vi.mock('../../services/machine-config-service', () => ({
  ZkMachineConfigService: class {
    getConfig = machineConfigGetMock
    saveConfig = vi.fn(async () => ({ ok: true, message: 'saved' }))
    syncTime = vi.fn(async () => ({ ok: true, message: 'synced' }))
  }
}))

vi.mock('../../services/admin-settings-service', () => ({
  AdminSettingsService: class {
    getDeviceBindingEnabled = getDeviceBindingEnabledMock
    saveDeviceBindingEnabled = saveDeviceBindingEnabledMock
    getRemoteRiskPolicy = vi.fn(async () => ({ mode: 'audit_only' }))
    saveRemoteRiskPolicy = saveRemoteRiskPolicyMock
  },
  SqlAdminSettingsRepository: class {}
}))

vi.mock('../../services/attendance-service', () => ({
  AttendanceService: class {
    getDashboard = vi.fn(async () => ({}))
    recordPunch = vi.fn(async () => ({ ok: true, message: 'ok' }))
  },
  SqlAttendanceRepository: class {}
}))

vi.mock('../../services/history-service', () => ({
  HistoryService: class {
    getHistory = vi.fn(async () => ({}))
  },
  SqlHistoryRepository: class {}
}))

vi.mock('../../services/notification-service', () => ({
  NotificationService: class {
    list = vi.fn(async () => [])
    markRead = vi.fn(async () => undefined)
    markAllRead = vi.fn(async () => undefined)
  },
  SqlNotificationRepository: class {}
}))

vi.mock('../../services/device-sync-service', () => ({
  DeviceSyncService: class {
    getStatus = vi.fn(async () => ({ lastSyncAt: null }))
    retryNow = vi.fn(async () => ({}))
  },
  PythonDeviceSyncWorker: class {},
  SqlDeviceSyncRepository: class {}
}))

vi.mock('../../services/settings-service', () => ({
  SettingsService: class {
    getProfile = vi.fn(async () => ({}))
  }
}))

vi.mock('../../services/update-service', () => ({
  UpdateService: class {
    checkForUpdates = checkForUpdatesMock
    downloadVerifiedUpdate = downloadVerifiedUpdateMock
  }
}))

vi.mock('../../config/app-config', () => ({
  appConfig: {
    deviceSync: {
      ip: '10.60.1.5'
    }
  }
}))

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    ipcHandlers.clear()
    machineConfigGetMock.mockClear()
    adminUsersListMock.mockClear()
    setUserActiveStateMock.mockClear()
    resetUserPasswordMock.mockClear()
    unbindDeviceMock.mockClear()
    batchSetActiveStateMock.mockClear()
    batchUnbindDevicesMock.mockClear()
    changeAdminPasswordMock.mockClear()
    resetAdminPasswordMock.mockClear()
    listAdminsMock.mockClear()
    saveRemoteRiskPolicyMock.mockClear()
    getDeviceBindingEnabledMock.mockClear()
    saveDeviceBindingEnabledMock.mockClear()
    authLoginMock.mockClear()
    getHardwareIdMock.mockClear()
    checkForUpdatesMock.mockClear()
    downloadVerifiedUpdateMock.mockClear()
    shellOpenExternalMock.mockClear()
    adminSession = { authenticated: false, mustChangePassword: false, admin: null }
    userSession = { authenticated: false, mustChangePassword: false, user: null }
  })

  it('rejects admin-only machine config reads when the admin session is missing', async () => {
    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('machine-config:get')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({})).rejects.toThrow('Phiên đăng nhập admin đã hết hạn')
    expect(machineConfigGetMock).not.toHaveBeenCalled()
  })

  it('allows saving remote-risk policy when an admin session is active', async () => {
    adminSession = {
      authenticated: true,
      mustChangePassword: false,
      admin: {
        id: 1,
        username: 'admin',
        displayName: 'Admin',
        role: 'super_admin'
      }
    }

    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('admin-settings:save-remote-risk-policy')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({}, { mode: 'block_high_risk' })).resolves.toEqual({
      ok: true,
      message: 'Đã lưu cấu hình chặn điều khiển từ xa',
      mode: 'block_high_risk'
    })

    expect(saveRemoteRiskPolicyMock).toHaveBeenCalledWith({ mode: 'block_high_risk' })
  })

  it('allows reading the device binding toggle when an admin session is active', async () => {
    adminSession = {
      authenticated: true,
      mustChangePassword: false,
      admin: {
        id: 1,
        username: 'admin',
        displayName: 'Admin',
        role: 'super_admin'
      }
    }
    getDeviceBindingEnabledMock.mockResolvedValueOnce(true)

    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('admin-settings:get-device-binding-enabled')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({})).resolves.toBe(true)
  })

  it('allows saving the device binding toggle when an admin session is active', async () => {
    adminSession = {
      authenticated: true,
      mustChangePassword: false,
      admin: {
        id: 1,
        username: 'admin',
        displayName: 'Admin',
        role: 'super_admin'
      }
    }

    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('admin-settings:save-device-binding-enabled')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({}, true)).resolves.toEqual({
      ok: true,
      message: 'Đã bật ràng buộc thiết bị đăng nhập'
    })

    expect(saveDeviceBindingEnabledMock).toHaveBeenCalledWith(true)
  })

  it('rejects admin user list reads when the admin session is missing', async () => {
    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('admin-users:list')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({}, { query: 'phan' })).rejects.toThrow('Phiên đăng nhập admin đã hết hạn')
    expect(adminUsersListMock).not.toHaveBeenCalled()
  })

  it('allows resetting a user password when an admin session is active', async () => {
    adminSession = {
      authenticated: true,
      mustChangePassword: false,
      admin: {
        id: 5,
        username: 'admin',
        displayName: 'Admin',
        role: 'super_admin'
      }
    }

    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('admin-users:reset-password')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({}, { userEnrollNumber: 18, temporaryPassword: 'Temp@123' })).resolves.toEqual({
      ok: true,
      message: 'Đã reset mật khẩu tạm và yêu cầu đổi lại ở lần đăng nhập tiếp theo'
    })

    expect(resetUserPasswordMock).toHaveBeenCalledWith(
      { userEnrollNumber: 18, temporaryPassword: 'Temp@123' },
      5
    )
  })

  it('allows unbinding a device when an admin session is active', async () => {
    adminSession = {
      authenticated: true,
      mustChangePassword: false,
      admin: {
        id: 5,
        username: 'admin',
        displayName: 'Admin',
        role: 'super_admin'
      }
    }

    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('admin-users:unbind-device')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({}, 18)).resolves.toEqual({
      ok: true,
      message: 'Đã gỡ liên kết thiết bị của nhân viên'
    })

    expect(unbindDeviceMock).toHaveBeenCalledWith(5, 18)
  })

  it('blocks protected admin actions while password change is pending', async () => {
    adminSession = {
      authenticated: true,
      mustChangePassword: true,
      admin: {
        id: 7,
        username: 'admin',
        displayName: 'Admin',
        role: 'super_admin'
      }
    }

    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('machine-config:get')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({})).rejects.toThrow('Admin cần đổi mật khẩu trước khi tiếp tục')
    expect(machineConfigGetMock).not.toHaveBeenCalled()
  })

  it('allows admin password change while password change is pending', async () => {
    adminSession = {
      authenticated: true,
      mustChangePassword: true,
      admin: {
        id: 9,
        username: 'admin',
        displayName: 'Admin',
        role: 'super_admin'
      }
    }

    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('admin:change-password')
    expect(handler).toBeTypeOf('function')

    await expect(
      handler?.({}, {
        currentPassword: 'Temp@123',
        newPassword: 'NewSecret@123',
        confirmPassword: 'NewSecret@123'
      })
    ).resolves.toEqual({
      ok: true,
      message: 'Đổi mật khẩu admin thành công'
    })

    expect(changeAdminPasswordMock).toHaveBeenCalledWith(
      {
        id: 9,
        username: 'admin',
        displayName: 'Admin',
        role: 'super_admin'
      },
      {
        currentPassword: 'Temp@123',
        newPassword: 'NewSecret@123',
        confirmPassword: 'NewSecret@123'
      }
    )
  })

  it('blocks attendance punches while device sync is in progress', async () => {
    userSession = {
      authenticated: true,
      mustChangePassword: false,
      user: {
        userEnrollNumber: 18,
        employeeCode: 'E0112599',
        fullName: 'Nguyen Van A',
        department: null,
        hireDate: null,
        scheduleName: null,
        avatarInitials: 'NA'
      }
    }

    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({
      ensureAppReady: async () => undefined,
      deviceSyncService: {
        getStatus: vi.fn(async () => ({
          status: 'syncing',
          deviceIp: '10.60.1.5',
          lastSyncAt: null,
          lastRunStartedAt: null,
          lastRunFinishedAt: null,
          lastImportedCount: 0,
          lastSkippedCount: 0,
          lastError: null
        })),
        retryNow: vi.fn(async () => ({
          status: 'syncing',
          deviceIp: '10.60.1.5',
          lastSyncAt: null,
          lastRunStartedAt: null,
          lastRunFinishedAt: null,
          lastImportedCount: 0,
          lastSkippedCount: 0,
          lastError: null
        }))
      } as any
    })

    const handler = ipcHandlers.get('attendance:check-in')
    expect(handler).toBeTypeOf('function')

    const result = await handler?.({})
    expect(result).toMatchObject({
      ok: false
    })
    expect(result).toMatchObject({ message: expect.stringMatching(/đồng bộ dữ liệu/i) })
  })

  it('passes the resolved hardware id into AuthService during login', async () => {
    authLoginMock.mockResolvedValueOnce({
      ok: true,
      requiresPasswordChange: false,
      user: {
        userEnrollNumber: 18,
        employeeCode: 'E0112599',
        fullName: 'Nguyen Van A',
        department: null,
        hireDate: null,
        scheduleName: null,
        avatarInitials: 'NA'
      }
    })

    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('auth:login')
    expect(handler).toBeTypeOf('function')

    await handler?.({}, { employeeCode: 'E0112599', password: '123456', rememberMe: true })

    expect(getHardwareIdMock).toHaveBeenCalledTimes(1)
    expect(authLoginMock).toHaveBeenCalledWith(
      { employeeCode: 'E0112599', password: '123456', rememberMe: true },
      'hardware-1'
    )
  })

  it('opens external links only when the URL uses HTTPS', async () => {
    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('app:open-external')
    expect(handler).toBeTypeOf('function')

    await handler?.({}, 'https://github.com/example/releases')

    expect(shellOpenExternalMock).toHaveBeenCalledWith('https://github.com/example/releases')
  })

  it('blocks non-HTTPS external links', async () => {
    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('app:open-external')
    expect(handler).toBeTypeOf('function')

    await handler?.({}, 'file:///C:/Windows/System32/cmd.exe')

    expect(shellOpenExternalMock).not.toHaveBeenCalled()
  })

  it('allows update checks even when app readiness fails', async () => {
    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({
      ensureAppReady: async () => {
        throw new Error('Missing required environment variable: WISEEYE_SQL_PASSWORD')
      }
    })

    const handler = ipcHandlers.get('app:check-for-updates')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({})).resolves.toBeNull()
    expect(checkForUpdatesMock).toHaveBeenCalledTimes(1)
  })

  it('exposes startup diagnostics without waiting for app readiness', async () => {
    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({
      ensureAppReady: async () => {
        throw new Error('Missing required environment variable: WISEEYE_SQL_PASSWORD')
      },
      getStartupStatus: () => ({
        status: 'error',
        category: 'missing-config',
        message: 'Missing required environment variable: WISEEYE_SQL_PASSWORD'
      })
    })

    const handler = ipcHandlers.get('app:get-startup-status')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({})).resolves.toEqual({
      status: 'error',
      category: 'missing-config',
      message: 'Missing required environment variable: WISEEYE_SQL_PASSWORD'
    })
  })

  it('delegates verified update downloads to UpdateService instead of opening the remote URL directly', async () => {
    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('app:download-verified-update')
    expect(handler).toBeTypeOf('function')

    const updateInfo = {
      latest: '1.0.4',
      downloadUrl: 'https://example.com/download-1.0.4.exe',
      releaseNotes: 'Signed release',
      integrity: {
        checksumSha256: 'b'.repeat(64),
        signature: 'signature',
        signedFieldsVersion: 1,
        status: 'verified' as const
      }
    }

    await expect(handler?.({}, updateInfo)).resolves.toEqual({
      ok: true,
      message: 'Đã tải và mở bản cập nhật đã xác thực.',
      filePath: 'E:/temp/CCPro-Portable-1.0.4.exe'
    })

    expect(downloadVerifiedUpdateMock).toHaveBeenCalledWith(updateInfo)
    expect(shellOpenExternalMock).not.toHaveBeenCalled()
  })

  it('rejects batch-set-active-state when admin session is missing', async () => {
    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('admin-users:batch-set-active-state')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({}, { userEnrollNumbers: [18, 19], isActive: false })).rejects.toThrow('Phiên đăng nhập admin đã hết hạn')
    expect(batchSetActiveStateMock).not.toHaveBeenCalled()
  })

  it('allows batch-set-active-state when an admin session is active', async () => {
    adminSession = {
      authenticated: true,
      mustChangePassword: false,
      admin: { id: 5, username: 'admin', displayName: 'Admin', role: 'super_admin' }
    }

    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('admin-users:batch-set-active-state')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({}, { userEnrollNumbers: [18, 19], isActive: false })).resolves.toEqual({
      ok: true,
      successCount: 2,
      failedCount: 0,
      message: 'Đã vô hiệu hóa 2 tài khoản'
    })

    expect(batchSetActiveStateMock).toHaveBeenCalledWith(
      { userEnrollNumbers: [18, 19], isActive: false },
      5
    )
  })

  it('allows batch-unbind-devices when an admin session is active', async () => {
    adminSession = {
      authenticated: true,
      mustChangePassword: false,
      admin: { id: 5, username: 'admin', displayName: 'Admin', role: 'super_admin' }
    }

    const { registerIpcHandlers } = await import('../register-handlers')

    registerIpcHandlers({ ensureAppReady: async () => undefined })

    const handler = ipcHandlers.get('admin-users:batch-unbind-devices')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({}, { userEnrollNumbers: [18] })).resolves.toEqual({
      ok: true,
      successCount: 2,
      failedCount: 0,
      message: 'Đã gỡ liên kết thiết bị của 2 nhân viên'
    })

    expect(batchUnbindDevicesMock).toHaveBeenCalledWith(
      { userEnrollNumbers: [18] },
      5
    )
  })
})
