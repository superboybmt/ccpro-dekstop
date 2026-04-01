export type AttendanceAction = 'check-in' | 'check-out'
export type AttendanceStatus = 'on-time' | 'late' | 'absent'

export interface AuthUser {
  userEnrollNumber: number
  employeeCode: string
  fullName: string
  department: string | null
  hireDate: string | null
  scheduleName: string | null
  avatarInitials: string
}

export interface AdminUser {
  id: number
  username: string
  displayName: string
  role: string
}

export interface AdminLoginPayload {
  username: string
  password: string
}

export interface AdminLoginResult {
  ok: boolean
  message?: string
  requiresPasswordChange?: boolean
  admin?: AdminUser
}

export interface AdminSessionState {
  authenticated: boolean
  mustChangePassword: boolean
  admin: AdminUser | null
}

export interface AdminAccount {
  id: number
  username: string
  displayName: string
  role: string
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt?: string | null
}

export interface AdminAccountList {
  admins: AdminAccount[]
}

export interface AdminResetAdminPasswordPayload {
  adminId: number
  temporaryPassword: string
}

export interface AdminManagedUser {
  userEnrollNumber: number
  employeeCode: string
  fullName: string
  department: string | null
  scheduleName: string | null
  wiseEyeEnabled: boolean
  appActive: boolean
  hasAppAccount: boolean
  mustChangePassword: boolean
}

export interface AdminManagedUserList {
  users: AdminManagedUser[]
}

export interface AdminManagedUserFilter {
  query?: string
}

export interface AdminSetUserActivePayload {
  userEnrollNumber: number
  isActive: boolean
}

export interface AdminResetUserPasswordPayload {
  userEnrollNumber: number
  temporaryPassword: string
}

export interface AutoSwitchState {
  stateKey: string
  stateList: string
  stateTimezone: string
}

export interface DeviceConfig {
  stateMode: number
  schedule: AutoSwitchState[]
}

export interface DeviceConfigPayload {
  stateMode: number
  schedule: AutoSwitchState[]
}

export interface DeviceConfigResult {
  ok: boolean
  message: string
  before?: DeviceConfig
  after?: DeviceConfig
}

export type RemoteRiskPolicyMode = 'audit_only' | 'block_high_risk'

export interface RemoteRiskPolicy {
  mode: RemoteRiskPolicyMode
}

export interface SessionState {
  authenticated: boolean
  mustChangePassword: boolean
  user: AuthUser | null
}

export interface LoginPayload {
  employeeCode: string
  password: string
  rememberMe: boolean
}

export interface LoginResult {
  ok: boolean
  message?: string
  requiresPasswordChange: boolean
  user?: AuthUser
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export interface MutationResult {
  ok: boolean
  message: string
}

export interface RemoteRiskSnapshot {
  level: 'low' | 'medium' | 'high'
  blocking: boolean
  message: string | null
  detectedProcesses: string[]
  activeSignals: string[]
}

export interface ShiftInfo {
  shiftName: string
  shiftCode: string | null
  onduty: string
  offduty: string
  onLunch: string | null
  offLunch: string | null
  workingHours: string
  lateGraceMinutes: number
}

export interface TimelineEntry {
  key: 'morning-in' | 'lunch-out' | 'afternoon-in' | 'day-out'
  label: string
  time: string
  completed: boolean
}

export interface DashboardData {
  shift: ShiftInfo | null
  timeline: TimelineEntry[]
  nextAction: AttendanceAction
  lastEventAt: string | null
  connectionStatus: 'connected' | 'disconnected'
  remoteRisk?: RemoteRiskSnapshot | null
}

export interface AttendanceDayRecord {
  date: string
  checkIn: string
  checkOut: string
  totalHours: string
  status: AttendanceStatus
  shiftName: string
}

export interface AttendanceStats {
  totalWorkingDays: number
  onTimeRate: number
  totalOvertimeHours: number
  absences: number
}

export interface HistoryFilter {
  month?: string
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
}

export interface HistoryData {
  filter: {
    month: string | null
    startDate: string
    endDate: string
    page: number
    pageSize: number
  }
  stats: AttendanceStats
  records: AttendanceDayRecord[]
  total: number
}

export interface NotificationItem {
  id: number
  category: 'late' | 'missing-checkout' | 'system'
  title: string
  description: string
  createdAt: string
  eventDate: string | null
  isRead: boolean
}

export interface SettingsProfile {
  fullName: string
  employeeCode: string
  department: string | null
  hireDate: string | null
  scheduleName: string | null
}

export interface AppInfo {
  version: string
  buildNumber: string
  connectionStatus: 'connected' | 'disconnected'
  lastSyncAt: string | null
}

export interface DeviceSyncStatus {
  status: 'idle' | 'syncing' | 'ok' | 'error'
  deviceIp: string
  lastSyncAt: string | null
  lastRunStartedAt: string | null
  lastRunFinishedAt: string | null
  lastImportedCount: number
  lastSkippedCount: number
  lastError: string | null
}

export interface UpdateInfo {
  latest: string
  downloadUrl: string
  releaseNotes?: string
}

export interface RendererApi {
  auth: {
    login(payload: LoginPayload): Promise<LoginResult>
    getSession(): Promise<SessionState>
    changePassword(payload: ChangePasswordPayload): Promise<MutationResult>
    logout(): Promise<void>
  }
  attendance: {
    getDashboard(): Promise<DashboardData>
    checkIn(): Promise<MutationResult>
    checkOut(): Promise<MutationResult>
    getHistory(filter: HistoryFilter): Promise<HistoryData>
  }
  notifications: {
    list(): Promise<NotificationItem[]>
    markRead(id: number): Promise<void>
    markAllRead(): Promise<void>
  }
  settings: {
    getProfile(): Promise<SettingsProfile>
    getAppInfo(): Promise<AppInfo>
  }
  deviceSync: {
    getStatus(): Promise<DeviceSyncStatus>
    retry(): Promise<DeviceSyncStatus>
  }
  admin: {
    login(payload: AdminLoginPayload): Promise<AdminLoginResult>
    getSession(): Promise<AdminSessionState>
    changePassword(payload: ChangePasswordPayload): Promise<MutationResult>
    listAdmins(): Promise<AdminAccountList>
    resetPassword(payload: AdminResetAdminPasswordPayload): Promise<MutationResult>
    logout(): Promise<void>
    bootstrap(args: { username: string; password: string; displayName: string }): Promise<{ ok: boolean; message: string }>
  }
  adminUsers: {
    listUsers(filter: AdminManagedUserFilter): Promise<AdminManagedUserList>
    setUserActiveState(payload: AdminSetUserActivePayload): Promise<MutationResult>
    resetUserPassword(payload: AdminResetUserPasswordPayload): Promise<MutationResult>
  }
  machineConfig: {
    getConfig(): Promise<DeviceConfig>
    saveConfig(payload: DeviceConfigPayload): Promise<DeviceConfigResult>
    syncTime(): Promise<MutationResult>
  }
  adminSettings: {
    getRemoteRiskPolicy(): Promise<RemoteRiskPolicy>
    saveRemoteRiskPolicy(policy: RemoteRiskPolicy): Promise<MutationResult & RemoteRiskPolicy>
  }
  app: {
    checkForUpdates(): Promise<UpdateInfo | null>
    openExternal(url: string): Promise<void>
    onUpdateAvailable(callback: (info: UpdateInfo) => void): () => void
  }
}
