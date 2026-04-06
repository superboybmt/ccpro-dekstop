import { app, ipcMain } from 'electron'
import type {
  AdminLoginPayload,
  AdminManagedUserFilter,
  AdminResetAdminPasswordPayload,
  AdminResetUserPasswordPayload,
  AdminSetUserActivePayload,
  AdminShiftUpdatePayload,
  ChangePasswordPayload,
  DeviceConfigPayload,
  HistoryFilter,
  LoginPayload
} from '@shared/api'
import { getConnectionStatus } from '../db/sql'
import { SessionStore } from '../session-store'
import { AttendanceService, SqlAttendanceRepository } from '../services/attendance-service'
import { AuthService, SqlAuthRepository } from '../services/auth-service'
import { AdminAuthService, SqlAdminAuthRepository } from '../services/admin-auth-service'
import { AdminSettingsService, SqlAdminSettingsRepository } from '../services/admin-settings-service'
import { AdminUserManagementService, SqlAdminUserManagementRepository } from '../services/admin-user-management-service'
import {
  DeviceSyncService,
  PythonDeviceSyncWorker,
  SqlDeviceSyncRepository
} from '../services/device-sync-service'
import { HistoryService, SqlHistoryRepository } from '../services/history-service'
import { ZkMachineConfigService } from '../services/machine-config-service'
import { NotificationService, SqlNotificationRepository } from '../services/notification-service'
import { SettingsService } from '../services/settings-service'
import { AdminShiftService, SqlAdminShiftRepository } from '../services/admin-shift-service'
import { AvatarService } from '../services/avatar-service'
import { UpdateService } from '../services/update-service'
import type { RegisterIpcHandlersOptions } from '../startup'
import { appConfig } from '../config/app-config'
import { isAllowedExternalUrl } from '../external-url'

const DISCONNECTED_DASHBOARD = {
  shift: null,
  timeline: [],
  nextAction: 'check-in' as const,
  lastEventAt: null,
  connectionStatus: 'disconnected' as const,
  remoteRisk: null
}
const SYNCING_PUNCH_BLOCK_MESSAGE =
  'Không thể chấm công trong khi hệ thống đang đồng bộ dữ liệu từ máy chấm công. Vui lòng thử lại sau.'

const ensureAuthenticated = (sessionStore: SessionStore) => {
  const session = sessionStore.getSession()
  if (!session.authenticated || !session.user) {
    throw new Error('Phiên đăng nhập đã hết hạn')
  }

  sessionStore.touch()
  return session
}

const ensureAdminAuthenticated = (sessionStore: SessionStore) => {
  const session = sessionStore.getAdminSession()
  if (!session.authenticated || !session.admin) {
    throw new Error('Phiên đăng nhập admin đã hết hạn')
  }

  sessionStore.touchAdmin()
  return session
}

const ensureAdminAuthorized = (sessionStore: SessionStore) => {
  const session = ensureAdminAuthenticated(sessionStore)
  if (session.mustChangePassword) {
    throw new Error('Admin cần đổi mật khẩu trước khi tiếp tục')
  }

  return session
}

type AppVersionReader = Pick<typeof app, 'getVersion'> & { getBuildVersion?: () => string }

export const resolveBuildNumber = (appVersionReader: AppVersionReader): string =>
  typeof appVersionReader.getBuildVersion === 'function'
    ? appVersionReader.getBuildVersion()
    : appVersionReader.getVersion()

type RegisterHandlersOptions = RegisterIpcHandlersOptions & {
  deviceSyncService?: DeviceSyncService
}

export const registerIpcHandlers = (options?: Partial<RegisterHandlersOptions>): void => {
  const ensureAppReady = options?.ensureAppReady ?? (async () => undefined)
  const getStartupStatus =
    options?.getStartupStatus ??
    (() => ({
      status: 'ready' as const,
      category: 'unknown' as const,
      message: null
    }))
  const sessionStore = new SessionStore()
  const authService = new AuthService(new SqlAuthRepository())
  const adminAuthService = new AdminAuthService(new SqlAdminAuthRepository())
  const adminUserManagementService = new AdminUserManagementService(new SqlAdminUserManagementRepository())
  const machineConfigService = new ZkMachineConfigService()
  const adminSettingsService = new AdminSettingsService(new SqlAdminSettingsRepository())
  const attendanceService = new AttendanceService(new SqlAttendanceRepository())
  const historyService = new HistoryService(new SqlHistoryRepository())
  const notificationService = new NotificationService(new SqlNotificationRepository())
  const settingsService = new SettingsService()
  const avatarService = new AvatarService()
  const adminShiftService = new AdminShiftService(new SqlAdminShiftRepository())
  const updateService = new UpdateService()
  const deviceSyncService =
    options?.deviceSyncService ??
    new DeviceSyncService(new SqlDeviceSyncRepository(), new PythonDeviceSyncWorker(), {
      deviceIp: appConfig.deviceSync.ip
    })

  ipcMain.handle('auth:login', async (_event, payload: LoginPayload) => {
    await ensureAppReady()
    const result = await authService.login(payload)

    if (result.ok && result.user) {
      sessionStore.setSession(result.user, result.requiresPasswordChange, payload.rememberMe)
    }

    return result
  })

  ipcMain.handle('auth:get-session', async () => sessionStore.getSession())

  ipcMain.handle('auth:change-password', async (_event, payload: ChangePasswordPayload) => {
    await ensureAppReady()
    const session = ensureAuthenticated(sessionStore)
    const result = await authService.changePassword(session.user!, payload)

    if (result.ok) {
      sessionStore.completePasswordChange()
    }

    return result
  })

  ipcMain.handle('auth:logout', async () => {
    sessionStore.clear()
  })

  ipcMain.handle('attendance:get-dashboard', async () => {
    await ensureAppReady()
    const session = ensureAuthenticated(sessionStore)
    const [connectionStatus, syncStatus] = await Promise.all([
      getConnectionStatus(),
      deviceSyncService.getStatus()
    ])

    if (connectionStatus === 'disconnected') {
      return {
        ...DISCONNECTED_DASHBOARD,
        deviceSyncStatus: syncStatus.status
      }
    }

    const dashboard = await attendanceService.getDashboard(session.user!.userEnrollNumber)
    return {
      ...dashboard,
      deviceSyncStatus: syncStatus.status
    }
  })

  ipcMain.handle('attendance:check-in', async () => {
    await ensureAppReady()
    const session = ensureAuthenticated(sessionStore)
    const syncStatus = await deviceSyncService.getStatus()
    if (syncStatus.status === 'syncing') {
      return {
        ok: false,
        message: SYNCING_PUNCH_BLOCK_MESSAGE
      }
    }

    return attendanceService.recordPunch(session.user!.userEnrollNumber, 'check-in')
  })

  ipcMain.handle('attendance:check-out', async () => {
    await ensureAppReady()
    const session = ensureAuthenticated(sessionStore)
    const syncStatus = await deviceSyncService.getStatus()
    if (syncStatus.status === 'syncing') {
      return {
        ok: false,
        message: SYNCING_PUNCH_BLOCK_MESSAGE
      }
    }

    return attendanceService.recordPunch(session.user!.userEnrollNumber, 'check-out')
  })

  ipcMain.handle('attendance:get-history', async (_event, filter: HistoryFilter) => {
    await ensureAppReady()
    const session = ensureAuthenticated(sessionStore)
    return historyService.getHistory(session.user!.userEnrollNumber, filter)
  })

  ipcMain.handle('notifications:list', async () => {
    await ensureAppReady()
    const session = ensureAuthenticated(sessionStore)
    return notificationService.list(session.user!.userEnrollNumber)
  })

  ipcMain.handle('notifications:mark-read', async (_event, id: number) => {
    await ensureAppReady()
    const session = ensureAuthenticated(sessionStore)
    await notificationService.markRead(session.user!.userEnrollNumber, id)
  })

  ipcMain.handle('notifications:mark-all-read', async () => {
    await ensureAppReady()
    const session = ensureAuthenticated(sessionStore)
    await notificationService.markAllRead(session.user!.userEnrollNumber)
  })

  ipcMain.handle('settings:get-profile', async () => {
    await ensureAppReady()
    const session = ensureAuthenticated(sessionStore)
    return settingsService.getProfile(session.user!.userEnrollNumber)
  })

  ipcMain.handle('settings:update-avatar', async (_event, base64: string) => {
    await ensureAppReady()
    const session = ensureAuthenticated(sessionStore)
    const result = await avatarService.updateAvatar(session.user!.userEnrollNumber, base64)
    if (result.ok) {
      sessionStore.updateAvatar(base64)
    }
    return result
  })

  ipcMain.handle('settings:remove-avatar', async () => {
    await ensureAppReady()
    const session = ensureAuthenticated(sessionStore)
    const result = await avatarService.removeAvatar(session.user!.userEnrollNumber)
    if (result.ok) {
      sessionStore.updateAvatar(undefined)
    }
    return result
  })

  ipcMain.handle('settings:get-app-info', async () => ({
    version: app.getVersion(),
    buildNumber: resolveBuildNumber(app),
    connectionStatus: await getConnectionStatus(),
    lastSyncAt: (await ensureAppReady().then(() => deviceSyncService.getStatus())).lastSyncAt
  }))

  ipcMain.handle('app:get-startup-status', async () => getStartupStatus())

  ipcMain.handle('device-sync:get-status', async () => {
    await ensureAppReady()
    return deviceSyncService.getStatus()
  })

  ipcMain.handle('device-sync:retry', async () => {
    await ensureAppReady()
    return deviceSyncService.retryNow()
  })

  ipcMain.handle('admin:login', async (_event, payload: AdminLoginPayload) => {
    await ensureAppReady()
    const result = await adminAuthService.login(payload)

    if (result.ok && result.admin) {
      sessionStore.setAdminSession(result.admin, result.requiresPasswordChange ?? false)
    }

    return result
  })

  ipcMain.handle('admin:get-session', async () => sessionStore.getAdminSession())

  ipcMain.handle('admin:change-password', async (_event, payload: ChangePasswordPayload) => {
    await ensureAppReady()
    const session = ensureAdminAuthenticated(sessionStore)
    const result = await adminAuthService.changePassword(session.admin!, payload)

    if (result.ok) {
      sessionStore.completeAdminPasswordChange()
    }

    return result
  })

  ipcMain.handle('admin:list', async () => {
    await ensureAppReady()
    ensureAdminAuthorized(sessionStore)
    return adminAuthService.listAdmins()
  })

  ipcMain.handle('admin:reset-password', async (_event, payload: AdminResetAdminPasswordPayload) => {
    await ensureAppReady()
    const session = ensureAdminAuthorized(sessionStore)
    return adminAuthService.resetPassword(payload, session.admin!.id)
  })

  ipcMain.handle('admin:logout', async () => {
    sessionStore.clearAdmin()
  })

  ipcMain.handle('admin:bootstrap', async (_event, args: { username: string; password: string; displayName: string }) => {
    await ensureAppReady()
    return adminAuthService.bootstrapFirstAdmin(args)
  })

  ipcMain.handle('admin-users:list', async (_event, filter: AdminManagedUserFilter) => {
    await ensureAppReady()
    ensureAdminAuthorized(sessionStore)
    return adminUserManagementService.listUsers(filter)
  })

  ipcMain.handle('admin-users:set-active-state', async (_event, payload: AdminSetUserActivePayload) => {
    await ensureAppReady()
    const session = ensureAdminAuthorized(sessionStore)
    return adminUserManagementService.setUserActiveState(payload, session.admin!.id)
  })

  ipcMain.handle('admin-users:reset-password', async (_event, payload: AdminResetUserPasswordPayload) => {
    await ensureAppReady()
    const session = ensureAdminAuthorized(sessionStore)
    return adminUserManagementService.resetUserPassword(payload, session.admin!.id)
  })

  ipcMain.handle('machine-config:get', async () => {
    await ensureAppReady()
    ensureAdminAuthorized(sessionStore)
    return machineConfigService.getConfig()
  })

  ipcMain.handle('machine-config:save', async (_event, payload: DeviceConfigPayload) => {
    await ensureAppReady()
    const session = ensureAdminAuthorized(sessionStore)
    return machineConfigService.saveConfig(payload, session.admin!.id)
  })

  ipcMain.handle('machine-config:sync-time', async () => {
    await ensureAppReady()
    const session = ensureAdminAuthorized(sessionStore)
    return machineConfigService.syncTime(session.admin!.id)
  })

  ipcMain.handle('admin-settings:get-remote-risk-policy', async () => {
    await ensureAppReady()
    ensureAdminAuthorized(sessionStore)
    return adminSettingsService.getRemoteRiskPolicy()
  })

  ipcMain.handle('admin-settings:save-remote-risk-policy', async (_event, policy) => {
    await ensureAppReady()
    ensureAdminAuthorized(sessionStore)
    return adminSettingsService.saveRemoteRiskPolicy(policy)
  })

  ipcMain.handle('admin-shifts:list', async () => {
    await ensureAppReady()
    ensureAdminAuthorized(sessionStore)
    return adminShiftService.listShifts()
  })

  ipcMain.handle('admin-shifts:update', async (_event, payload: AdminShiftUpdatePayload) => {
    await ensureAppReady()
    const session = ensureAdminAuthorized(sessionStore)
    return adminShiftService.updateShift(payload, session.admin!.id)
  })

  ipcMain.handle('app:check-for-updates', async () => {
    return updateService.checkForUpdates()
  })

  ipcMain.handle('app:download-verified-update', async (_event, info) => {
    return updateService.downloadVerifiedUpdate(info)
  })

  ipcMain.handle('app:open-external', async (_event, url: string) => {
    if (!isAllowedExternalUrl(url)) {
      return
    }

    const { shell } = await import('electron')
    await shell.openExternal(url)
  })
}
