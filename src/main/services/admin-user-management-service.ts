import bcrypt from 'bcryptjs'
import type {
  AdminManagedUser,
  AdminManagedUserFilter,
  AdminManagedUserList,
  AdminResetUserPasswordPayload,
  AdminSetUserActivePayload,
  AdminBatchSetActivePayload,
  AdminBatchUnbindPayload,
  BatchMutationResult,
  MutationResult
} from '@shared/api'
import { getPool } from '../db/sql'
import { formatSqlDateTime } from './sql-datetime'

interface EmployeeDirectoryRecord {
  userEnrollNumber: number
  employeeCode: string
  fullName: string
  department: string | null
  scheduleName: string | null
  wiseEyeEnabled: boolean
}

interface ManagedAppUserRecord {
  userEnrollNumber: number
  employeeCode: string
  passwordHash: string
  isFirstLogin: boolean
  isActiveApp: boolean
  boundHardwareId: string | null
}

interface AdminUserAuditPayload {
  adminId: number
  userEnrollNumber: number
  employeeCode: string
  action: 'activate' | 'deactivate' | 'reset-password' | 'unbind-device'
  beforeJson: string | null
  afterJson: string | null
}

export interface AdminUserManagementRepository {
  listEmployeeDirectory(filter: AdminManagedUserFilter): Promise<EmployeeDirectoryRecord[]>
  findEmployeeByEnrollNumber(userEnrollNumber: number): Promise<EmployeeDirectoryRecord | null>
  listAppUsersByEnrollNumbers(userEnrollNumbers: number[]): Promise<ManagedAppUserRecord[]>
  findAppUserByEnrollNumber(userEnrollNumber: number): Promise<ManagedAppUserRecord | null>
  upsertManagedUser(args: {
    userEnrollNumber: number
    employeeCode: string
    passwordHash: string
    isFirstLogin: boolean
    isActiveApp: boolean
    updatedByAdminId: number
  }): Promise<void>
  setBoundHardwareId(userEnrollNumber: number, hardwareId: string | null, updatedByAdminId: number): Promise<void>
  insertAuditLog(payload: AdminUserAuditPayload): Promise<void>
}

const serializeManagedState = (user: AdminManagedUser) =>
  JSON.stringify({
    appActive: user.appActive,
    hasAppAccount: user.hasAppAccount,
    mustChangePassword: user.mustChangePassword,
    boundHardwareId: user.boundHardwareId
  })

const normalizeFilter = (filter: AdminManagedUserFilter): string => filter.query?.trim() ?? ''

const DEFAULT_DIRECTORY_LIMIT = 100

export class AdminUserManagementService {
  constructor(private readonly repository: AdminUserManagementRepository) {}

  async listUsers(filter: AdminManagedUserFilter): Promise<AdminManagedUserList> {
    const employees = await this.repository.listEmployeeDirectory(filter)
    const appUsers = await this.repository.listAppUsersByEnrollNumbers(employees.map((item) => item.userEnrollNumber))
    const appUsersByEnrollNumber = new Map(appUsers.map((item) => [item.userEnrollNumber, item]))

    return {
      users: employees.map((employee) => this.toManagedUser(employee, appUsersByEnrollNumber.get(employee.userEnrollNumber)))
    }
  }

  async setUserActiveState(
    payload: AdminSetUserActivePayload,
    adminId: number
  ): Promise<MutationResult> {
    const employee = await this.repository.findEmployeeByEnrollNumber(payload.userEnrollNumber)
    if (!employee) {
      return { ok: false, message: 'Không tìm thấy nhân viên' }
    }

    const existingAppUser = await this.repository.findAppUserByEnrollNumber(payload.userEnrollNumber)
    const beforeUser = this.toManagedUser(employee, existingAppUser)
    const passwordHash = existingAppUser?.passwordHash ?? (await bcrypt.hash(employee.employeeCode, 10))

    await this.repository.upsertManagedUser({
      userEnrollNumber: employee.userEnrollNumber,
      employeeCode: employee.employeeCode,
      passwordHash,
      isFirstLogin: existingAppUser?.isFirstLogin ?? true,
      isActiveApp: payload.isActive,
      updatedByAdminId: adminId
    })

    const afterUser = this.toManagedUser(employee, {
      userEnrollNumber: employee.userEnrollNumber,
      employeeCode: employee.employeeCode,
      passwordHash,
      isFirstLogin: existingAppUser?.isFirstLogin ?? true,
      isActiveApp: payload.isActive
    })

    await this.repository.insertAuditLog({
      adminId,
      userEnrollNumber: employee.userEnrollNumber,
      employeeCode: employee.employeeCode,
      action: payload.isActive ? 'activate' : 'deactivate',
      beforeJson: serializeManagedState(beforeUser),
      afterJson: serializeManagedState(afterUser)
    })

    return {
      ok: true,
      message: payload.isActive ? 'Đã kích hoạt tài khoản ứng dụng' : 'Đã vô hiệu hóa tài khoản ứng dụng'
    }
  }

  async resetUserPassword(
    payload: AdminResetUserPasswordPayload,
    adminId: number
  ): Promise<MutationResult> {
    if (payload.temporaryPassword.trim().length < 6) {
      return { ok: false, message: 'Mật khẩu tạm phải có ít nhất 6 ký tự' }
    }

    const employee = await this.repository.findEmployeeByEnrollNumber(payload.userEnrollNumber)
    if (!employee) {
      return { ok: false, message: 'Không tìm thấy nhân viên' }
    }

    const existingAppUser = await this.repository.findAppUserByEnrollNumber(payload.userEnrollNumber)
    const beforeUser = this.toManagedUser(employee, existingAppUser)
    const passwordHash = await bcrypt.hash(payload.temporaryPassword, 10)

    await this.repository.upsertManagedUser({
      userEnrollNumber: employee.userEnrollNumber,
      employeeCode: employee.employeeCode,
      passwordHash,
      isFirstLogin: true,
      isActiveApp: existingAppUser?.isActiveApp ?? true,
      updatedByAdminId: adminId
    })

    const afterUser = this.toManagedUser(employee, {
      userEnrollNumber: employee.userEnrollNumber,
      employeeCode: employee.employeeCode,
      passwordHash,
      isFirstLogin: true,
      isActiveApp: existingAppUser?.isActiveApp ?? true
    })

    await this.repository.insertAuditLog({
      adminId,
      userEnrollNumber: employee.userEnrollNumber,
      employeeCode: employee.employeeCode,
      action: 'reset-password',
      beforeJson: serializeManagedState(beforeUser),
      afterJson: serializeManagedState(afterUser)
    })

    return {
      ok: true,
      message: 'Đã reset mật khẩu tạm và yêu cầu đổi lại ở lần đăng nhập tiếp theo'
    }
  }

  async unbindDevice(adminId: number, userEnrollNumber: number): Promise<MutationResult> {
    const employee = await this.repository.findEmployeeByEnrollNumber(userEnrollNumber)
    if (!employee) {
      return { ok: false, message: 'Không tìm thấy nhân viên' }
    }

    const existingAppUser = await this.repository.findAppUserByEnrollNumber(userEnrollNumber)
    if (!existingAppUser?.boundHardwareId) {
      return { ok: false, message: 'Nhân viên chưa có thiết bị được gắn' }
    }

    const beforeUser = this.toManagedUser(employee, existingAppUser)
    await this.repository.setBoundHardwareId(userEnrollNumber, null, adminId)
    const afterUser = this.toManagedUser(employee, {
      ...existingAppUser,
      boundHardwareId: null
    })

    await this.repository.insertAuditLog({
      adminId,
      userEnrollNumber,
      employeeCode: employee.employeeCode,
      action: 'unbind-device',
      beforeJson: serializeManagedState(beforeUser),
      afterJson: serializeManagedState(afterUser)
    })

    return {
      ok: true,
      message: 'Đã gỡ liên kết thiết bị của nhân viên'
    }
  }

  async batchSetUserActiveState(
    payload: AdminBatchSetActivePayload,
    adminId: number
  ): Promise<BatchMutationResult> {
    if (payload.userEnrollNumbers.length === 0) {
      return { ok: false, successCount: 0, failedCount: 0, message: 'Không có người dùng nào được chọn' }
    }

    let successCount = 0
    let failedCount = 0

    for (const userEnrollNumber of payload.userEnrollNumbers) {
      const result = await this.setUserActiveState(
        { userEnrollNumber, isActive: payload.isActive },
        adminId
      )
      if (result.ok) {
        successCount++
      } else {
        failedCount++
      }
    }

    const action = payload.isActive ? 'kích hoạt' : 'vô hiệu hóa'
    const ok = successCount > 0
    const message = failedCount === 0
      ? `Đã ${action} ${successCount} tài khoản`
      : `Đã ${action} ${successCount} tài khoản, ${failedCount} thất bại`

    return { ok, successCount, failedCount, message }
  }

  async batchUnbindDevices(
    payload: AdminBatchUnbindPayload,
    adminId: number
  ): Promise<BatchMutationResult> {
    if (payload.userEnrollNumbers.length === 0) {
      return { ok: false, successCount: 0, failedCount: 0, message: 'Không có người dùng nào được chọn' }
    }

    let successCount = 0
    let failedCount = 0

    for (const userEnrollNumber of payload.userEnrollNumbers) {
      const result = await this.unbindDevice(adminId, userEnrollNumber)
      if (result.ok) {
        successCount++
      } else {
        failedCount++
      }
    }

    const ok = successCount > 0
    const message = failedCount === 0
      ? `Đã gỡ liên kết thiết bị của ${successCount} nhân viên`
      : `Đã gỡ ${successCount} thiết bị, ${failedCount} thất bại`

    return { ok, successCount, failedCount, message }
  }

  private toManagedUser(
    employee: EmployeeDirectoryRecord,
    appUser?: ManagedAppUserRecord | null
  ): AdminManagedUser {
    return {
      userEnrollNumber: employee.userEnrollNumber,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      department: employee.department,
      scheduleName: employee.scheduleName,
      wiseEyeEnabled: employee.wiseEyeEnabled,
      appActive: appUser?.isActiveApp ?? true,
      hasAppAccount: Boolean(appUser),
      mustChangePassword: appUser ? appUser.isFirstLogin : true,
      boundHardwareId: appUser?.boundHardwareId ?? null
    }
  }
}

export class SqlAdminUserManagementRepository implements AdminUserManagementRepository {
  async listEmployeeDirectory(filter: AdminManagedUserFilter): Promise<EmployeeDirectoryRecord[]> {
    const pool = await getPool('wise-eye')
    const request = pool.request()
    const query = normalizeFilter(filter)
    const keyword = `%${query}%`

    request.input('limit', DEFAULT_DIRECTORY_LIMIT)
    request.input('query', query)
    request.input('keyword', keyword)

    const result = await request.query(`
      SELECT TOP (@limit)
        u.UserEnrollNumber,
        u.UserFullCode,
        u.UserFullName,
        rd.Description AS Department,
        s.SchName AS ScheduleName,
        CAST(u.UserEnabled AS bit) AS WiseEyeEnabled
      FROM dbo.UserInfo u
      LEFT JOIN dbo.RelationDept rd ON rd.ID = u.UserIDD
      LEFT JOIN dbo.Schedule s ON s.SchID = u.SchID
      WHERE @query = N''
         OR UPPER(LTRIM(RTRIM(u.UserFullCode))) LIKE UPPER(@keyword)
         OR u.UserFullName LIKE @keyword
      ORDER BY u.UserFullCode ASC
    `)

    return result.recordset.map((row) => ({
      userEnrollNumber: row.UserEnrollNumber,
      employeeCode: row.UserFullCode,
      fullName: row.UserFullName,
      department: row.Department ?? null,
      scheduleName: row.ScheduleName ?? null,
      wiseEyeEnabled: row.WiseEyeEnabled
    }))
  }

  async findEmployeeByEnrollNumber(userEnrollNumber: number): Promise<EmployeeDirectoryRecord | null> {
    const pool = await getPool('wise-eye')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)

    const result = await request.query(`
      SELECT TOP 1
        u.UserEnrollNumber,
        u.UserFullCode,
        u.UserFullName,
        rd.Description AS Department,
        s.SchName AS ScheduleName,
        CAST(u.UserEnabled AS bit) AS WiseEyeEnabled
      FROM dbo.UserInfo u
      LEFT JOIN dbo.RelationDept rd ON rd.ID = u.UserIDD
      LEFT JOIN dbo.Schedule s ON s.SchID = u.SchID
      WHERE u.UserEnrollNumber = @userEnrollNumber
    `)

    const row = result.recordset[0]
    if (!row) return null

    return {
      userEnrollNumber: row.UserEnrollNumber,
      employeeCode: row.UserFullCode,
      fullName: row.UserFullName,
      department: row.Department ?? null,
      scheduleName: row.ScheduleName ?? null,
      wiseEyeEnabled: row.WiseEyeEnabled
    }
  }

  async listAppUsersByEnrollNumbers(userEnrollNumbers: number[]): Promise<ManagedAppUserRecord[]> {
    if (userEnrollNumbers.length === 0) return []

    const pool = await getPool('app')
    const request = pool.request()
    const placeholders = userEnrollNumbers.map((_, index) => `@userEnrollNumber${index}`)

    userEnrollNumbers.forEach((userEnrollNumber, index) => {
      request.input(`userEnrollNumber${index}`, userEnrollNumber)
    })

    const result = await request.query(`
      SELECT
        user_enroll_number,
        employee_code,
        password_hash,
        is_first_login,
        is_active_app,
        bound_hardware_id
      FROM dbo.app_users
      WHERE user_enroll_number IN (${placeholders.join(', ')})
    `)

    return result.recordset.map((row) => ({
      userEnrollNumber: row.user_enroll_number,
      employeeCode: row.employee_code,
      passwordHash: row.password_hash,
      isFirstLogin: row.is_first_login,
      isActiveApp: row.is_active_app,
      boundHardwareId: row.bound_hardware_id ?? null
    }))
  }

  async findAppUserByEnrollNumber(userEnrollNumber: number): Promise<ManagedAppUserRecord | null> {
    const users = await this.listAppUsersByEnrollNumbers([userEnrollNumber])
    return users[0] ?? null
  }

  async upsertManagedUser(args: {
    userEnrollNumber: number
    employeeCode: string
    passwordHash: string
    isFirstLogin: boolean
    isActiveApp: boolean
    updatedByAdminId: number
  }): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('userEnrollNumber', args.userEnrollNumber)
    request.input('employeeCode', args.employeeCode)
    request.input('passwordHash', args.passwordHash)
    request.input('isFirstLogin', args.isFirstLogin)
    request.input('isActiveApp', args.isActiveApp)
    request.input('updatedByAdminId', args.updatedByAdminId)
    request.input('now', formatSqlDateTime(new Date()))

    await request.query(`
      MERGE dbo.app_users AS target
      USING (
        SELECT
          @userEnrollNumber AS user_enroll_number,
          @employeeCode AS employee_code,
          @passwordHash AS password_hash,
          @isFirstLogin AS is_first_login,
          @isActiveApp AS is_active_app,
          @updatedByAdminId AS updated_by_admin_id
      ) AS source
      ON target.user_enroll_number = source.user_enroll_number
      WHEN MATCHED THEN
        UPDATE SET
          employee_code = source.employee_code,
          password_hash = source.password_hash,
          is_first_login = source.is_first_login,
          is_active_app = source.is_active_app,
          updated_by_admin_id = source.updated_by_admin_id,
          password_changed_at = CONVERT(datetime2, @now, 120),
          updated_at = CONVERT(datetime2, @now, 120)
      WHEN NOT MATCHED THEN
        INSERT (
          user_enroll_number,
          employee_code,
          password_hash,
          is_first_login,
          is_active_app,
          updated_by_admin_id,
          password_changed_at,
          created_at,
          updated_at
        )
        VALUES (
          source.user_enroll_number,
          source.employee_code,
          source.password_hash,
          source.is_first_login,
          source.is_active_app,
          source.updated_by_admin_id,
          CONVERT(datetime2, @now, 120),
          CONVERT(datetime2, @now, 120),
          CONVERT(datetime2, @now, 120)
        );
    `)
  }

  async setBoundHardwareId(
    userEnrollNumber: number,
    hardwareId: string | null,
    updatedByAdminId: number
  ): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)
    request.input('hardwareId', hardwareId)
    request.input('updatedByAdminId', updatedByAdminId)
    request.input('now', formatSqlDateTime(new Date()))

    await request.query(`
      UPDATE dbo.app_users
      SET
        bound_hardware_id = @hardwareId,
        updated_by_admin_id = @updatedByAdminId,
        updated_at = CONVERT(datetime2, @now, 120)
      WHERE user_enroll_number = @userEnrollNumber
    `)
  }

  async insertAuditLog(payload: AdminUserAuditPayload): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('adminId', payload.adminId)
    request.input('userEnrollNumber', payload.userEnrollNumber)
    request.input('employeeCode', payload.employeeCode)
    request.input('action', payload.action)
    request.input('beforeJson', payload.beforeJson)
    request.input('afterJson', payload.afterJson)

    await request.query(`
      INSERT INTO dbo.admin_user_audit_logs (
        admin_id,
        user_enroll_number,
        employee_code,
        action,
        before_json,
        after_json
      )
      VALUES (
        @adminId,
        @userEnrollNumber,
        @employeeCode,
        @action,
        @beforeJson,
        @afterJson
      )
    `)
  }
}
