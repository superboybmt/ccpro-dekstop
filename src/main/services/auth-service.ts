import bcrypt from 'bcryptjs'
import type {
  AuthUser,
  ChangePasswordPayload,
  LoginPayload,
  LoginResult,
  MutationResult
} from '@shared/api'
import { getPool } from '../db/sql'
import { SlidingWindowRateLimiter, formatLockoutMessage } from './rate-limiter'
import { formatSqlDateTime } from './sql-datetime'

const INVALID_CREDENTIALS_MESSAGE = 'Sai mã nhân viên hoặc mật khẩu'
const DISABLED_MESSAGE = 'Tài khoản đã bị vô hiệu hóa'
const APP_DISABLED_MESSAGE = 'Tài khoản ứng dụng đã bị vô hiệu hóa'
const ACCOUNT_BOUND_TO_OTHER_DEVICE_MESSAGE =
  'Tài khoản của bạn đã được gắn với thiết bị khác. Vui lòng liên hệ quản trị viên.'
const DEVICE_BOUND_TO_OTHER_ACCOUNT_MESSAGE =
  'Thiết bị này đã được đăng ký cho tài khoản khác. Vui lòng liên hệ quản trị viên.'

export interface EmployeeRecord {
  userEnrollNumber: number
  employeeCode: string
  fullName: string
  isEnabled: boolean
  schId: number | null
  department: string | null
  hireDate: string | null
  scheduleName: string | null
}

export interface AppUserRecord {
  userEnrollNumber: number
  employeeCode: string
  passwordHash: string
  isFirstLogin: boolean
  isActiveApp: boolean
  avatarBase64: string | null
  boundHardwareId: string | null
}

export interface AuthRepository {
  findEmployeeByCode(employeeCode: string): Promise<EmployeeRecord | null>
  findAppUserByEnrollNumber(userEnrollNumber: number): Promise<AppUserRecord | null>
  findUserByHardwareId(hardwareId: string): Promise<AppUserRecord | null>
  updateHardwareId(userEnrollNumber: number, hardwareId: string): Promise<void>
  upsertPassword(args: {
    userEnrollNumber: number
    employeeCode: string
    passwordHash: string
    isFirstLogin: boolean
  }): Promise<void>
}

const normalizeHardwareId = (hardwareId: string | null | undefined): string | null => {
  const normalized = hardwareId?.trim().toLowerCase() ?? ''
  return normalized.length > 0 ? normalized : null
}

const buildInitials = (fullName: string): string =>
  fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly rateLimiter = new SlidingWindowRateLimiter(),
    private readonly getDeviceBindingEnabled: () => Promise<boolean> = async () => false
  ) {}

  async login(payload: LoginPayload, hardwareId?: string): Promise<LoginResult> {
    const employeeCode = payload.employeeCode.trim().toUpperCase()
    const lockout = this.rateLimiter.getLockout(employeeCode)
    if (lockout.locked) {
      return {
        ok: false,
        requiresPasswordChange: false,
        message: formatLockoutMessage(lockout.remainingMs)
      }
    }

    const employee = await this.repository.findEmployeeByCode(employeeCode)

    if (!employee) {
      this.rateLimiter.recordFailure(employeeCode)
      return {
        ok: false,
        requiresPasswordChange: false,
        message: INVALID_CREDENTIALS_MESSAGE
      }
    }

    if (!employee.isEnabled) {
      this.rateLimiter.recordFailure(employeeCode)
      return {
        ok: false,
        requiresPasswordChange: false,
        message: DISABLED_MESSAGE
      }
    }

    const appUser = await this.repository.findAppUserByEnrollNumber(employee.userEnrollNumber)
    if (appUser && !appUser.isActiveApp) {
      this.rateLimiter.recordFailure(employeeCode)
      return {
        ok: false,
        requiresPasswordChange: false,
        message: APP_DISABLED_MESSAGE
      }
    }

    const password = payload.password
    const matchesPassword = appUser
      ? await bcrypt.compare(password, appUser.passwordHash)
      : password === employeeCode

    if (!matchesPassword) {
      this.rateLimiter.recordFailure(employeeCode)
      return {
        ok: false,
        requiresPasswordChange: false,
        message: INVALID_CREDENTIALS_MESSAGE
      }
    }

    const requiresPasswordChange = !appUser || appUser.isFirstLogin
    const avatarBase64 = appUser?.avatarBase64 ?? null
    const normalizedHardwareId = normalizeHardwareId(hardwareId)
    const deviceBindingEnabled = normalizedHardwareId ? await this.getDeviceBindingEnabled() : false

    if (normalizedHardwareId && deviceBindingEnabled) {
      if (appUser?.boundHardwareId && appUser.boundHardwareId !== normalizedHardwareId) {
        return {
          ok: false,
          requiresPasswordChange: false,
          message: ACCOUNT_BOUND_TO_OTHER_DEVICE_MESSAGE
        }
      }

      const userBoundToDevice = await this.repository.findUserByHardwareId(normalizedHardwareId)
      if (userBoundToDevice && userBoundToDevice.userEnrollNumber !== employee.userEnrollNumber) {
        return {
          ok: false,
          requiresPasswordChange: false,
          message: DEVICE_BOUND_TO_OTHER_ACCOUNT_MESSAGE
        }
      }
    }

    if (normalizedHardwareId && !appUser?.boundHardwareId) {
      await this.repository.updateHardwareId(employee.userEnrollNumber, normalizedHardwareId)
    }

    this.rateLimiter.reset(employeeCode)

    return {
      ok: true,
      requiresPasswordChange,
      user: this.serializeUser(employee, avatarBase64)
    }
  }

  async changePassword(user: AuthUser, payload: ChangePasswordPayload): Promise<MutationResult> {
    if (payload.newPassword.length < 6) {
      return {
        ok: false,
        message: 'Mật khẩu mới phải có ít nhất 6 ký tự'
      }
    }

    if (payload.newPassword !== payload.confirmPassword) {
      return {
        ok: false,
        message: 'Mật khẩu xác nhận không khớp'
      }
    }

    const employee = await this.repository.findEmployeeByCode(user.employeeCode)
    if (!employee) {
      return {
        ok: false,
        message: INVALID_CREDENTIALS_MESSAGE
      }
    }

    const appUser = await this.repository.findAppUserByEnrollNumber(employee.userEnrollNumber)
    const currentPasswordMatches = appUser
      ? await bcrypt.compare(payload.currentPassword, appUser.passwordHash)
      : payload.currentPassword === user.employeeCode

    if (!currentPasswordMatches) {
      return {
        ok: false,
        message: 'Mật khẩu hiện tại không đúng'
      }
    }

    const passwordHash = await bcrypt.hash(payload.newPassword, 10)
    await this.repository.upsertPassword({
      userEnrollNumber: employee.userEnrollNumber,
      employeeCode: employee.employeeCode,
      passwordHash,
      isFirstLogin: false
    })

    return {
      ok: true,
      message: 'Đổi mật khẩu thành công'
    }
  }

  private serializeUser(employee: EmployeeRecord, avatarBase64: string | null): AuthUser {
    return {
      userEnrollNumber: employee.userEnrollNumber,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      department: employee.department,
      hireDate: employee.hireDate,
      scheduleName: employee.scheduleName,
      avatarInitials: buildInitials(employee.fullName),
      avatarBase64
    }
  }
}

export class SqlAuthRepository implements AuthRepository {
  async findEmployeeByCode(employeeCode: string): Promise<EmployeeRecord | null> {
    const pool = await getPool('wise-eye')
    const request = pool.request()
    request.input('employeeCode', employeeCode)

    const result = await request.query(`
      SELECT TOP 1
        u.UserEnrollNumber,
        u.UserFullCode,
        u.UserFullName,
        CAST(u.UserEnabled AS bit) AS UserEnabled,
        u.SchID,
        CONVERT(varchar(10), u.UserHireDay, 23) AS HireDate,
        rd.Description AS Department,
        s.SchName AS ScheduleName
      FROM dbo.UserInfo u
      LEFT JOIN dbo.RelationDept rd ON rd.ID = u.UserIDD
      LEFT JOIN dbo.Schedule s ON s.SchID = u.SchID
      WHERE UPPER(LTRIM(RTRIM(u.UserFullCode))) = @employeeCode
    `)

    const row = result.recordset[0]
    if (!row) return null

    return {
      userEnrollNumber: row.UserEnrollNumber,
      employeeCode: row.UserFullCode,
      fullName: row.UserFullName,
      isEnabled: row.UserEnabled,
      schId: row.SchID,
      department: row.Department ?? null,
      hireDate: row.HireDate ?? null,
      scheduleName: row.ScheduleName ?? null
    }
  }

  async findAppUserByEnrollNumber(userEnrollNumber: number): Promise<AppUserRecord | null> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)

    const result = await request.query(`
      SELECT TOP 1
        user_enroll_number,
        employee_code,
        password_hash,
        is_first_login,
        is_active_app,
        avatar_base64,
        bound_hardware_id
      FROM dbo.app_users
      WHERE user_enroll_number = @userEnrollNumber
    `)

    const row = result.recordset[0]
    if (!row) return null

    return {
      userEnrollNumber: row.user_enroll_number,
      employeeCode: row.employee_code,
      passwordHash: row.password_hash,
      isFirstLogin: row.is_first_login,
      isActiveApp: row.is_active_app,
      avatarBase64: row.avatar_base64,
      boundHardwareId: row.bound_hardware_id ?? null
    }
  }

  async findUserByHardwareId(hardwareId: string): Promise<AppUserRecord | null> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('hardwareId', hardwareId)

    const result = await request.query(`
      SELECT TOP 1
        user_enroll_number,
        employee_code,
        password_hash,
        is_first_login,
        is_active_app,
        avatar_base64,
        bound_hardware_id
      FROM dbo.app_users
      WHERE bound_hardware_id = @hardwareId
    `)

    const row = result.recordset[0]
    if (!row) return null

    return {
      userEnrollNumber: row.user_enroll_number,
      employeeCode: row.employee_code,
      passwordHash: row.password_hash,
      isFirstLogin: row.is_first_login,
      isActiveApp: row.is_active_app,
      avatarBase64: row.avatar_base64 ?? null,
      boundHardwareId: row.bound_hardware_id ?? null
    }
  }

  async updateHardwareId(userEnrollNumber: number, hardwareId: string): Promise<void> {
    const employee = await this.findEmployeeByEnrollNumber(userEnrollNumber)
    if (!employee) {
      throw new Error('Không tìm thấy nhân viên để gắn thiết bị')
    }

    const pool = await getPool('app')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)
    request.input('employeeCode', employee.employeeCode)
    request.input('passwordHash', await bcrypt.hash(employee.employeeCode, 10))
    request.input('hardwareId', hardwareId)
    request.input('now', formatSqlDateTime(new Date()))

    await request.query(`
      MERGE dbo.app_users AS target
      USING (
        SELECT
          @userEnrollNumber AS user_enroll_number,
          @employeeCode AS employee_code,
          @passwordHash AS password_hash,
          @hardwareId AS bound_hardware_id
      ) AS source
      ON target.user_enroll_number = source.user_enroll_number
      WHEN MATCHED THEN
        UPDATE SET
          bound_hardware_id = source.bound_hardware_id,
          updated_at = CONVERT(datetime2, @now, 120)
      WHEN NOT MATCHED THEN
        INSERT (
          user_enroll_number,
          employee_code,
          password_hash,
          is_first_login,
          is_active_app,
          bound_hardware_id,
          created_at,
          updated_at
        )
        VALUES (
          source.user_enroll_number,
          source.employee_code,
          source.password_hash,
          1,
          1,
          source.bound_hardware_id,
          CONVERT(datetime2, @now, 120),
          CONVERT(datetime2, @now, 120)
        );
    `)
  }

  async upsertPassword(args: {
    userEnrollNumber: number
    employeeCode: string
    passwordHash: string
    isFirstLogin: boolean
  }): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('userEnrollNumber', args.userEnrollNumber)
    request.input('employeeCode', args.employeeCode)
    request.input('passwordHash', args.passwordHash)
    request.input('isFirstLogin', args.isFirstLogin)
    request.input('changedAt', formatSqlDateTime(new Date()))

    await request.query(`
      MERGE dbo.app_users AS target
      USING (
        SELECT
          @userEnrollNumber AS user_enroll_number,
          @employeeCode AS employee_code,
          @passwordHash AS password_hash,
          @isFirstLogin AS is_first_login
      ) AS source
      ON target.user_enroll_number = source.user_enroll_number
      WHEN MATCHED THEN
        UPDATE SET
          employee_code = source.employee_code,
          password_hash = source.password_hash,
          is_first_login = source.is_first_login,
          password_changed_at = CONVERT(datetime2, @changedAt, 120),
          updated_at = CONVERT(datetime2, @changedAt, 120)
      WHEN NOT MATCHED THEN
        INSERT (
          user_enroll_number,
          employee_code,
          password_hash,
          is_first_login,
          is_active_app,
          password_changed_at,
          created_at,
          updated_at
        )
        VALUES (
          source.user_enroll_number,
          source.employee_code,
          source.password_hash,
          source.is_first_login,
          1,
          CONVERT(datetime2, @changedAt, 120),
          CONVERT(datetime2, @changedAt, 120),
          CONVERT(datetime2, @changedAt, 120)
        );
    `)
  }

  private async findEmployeeByEnrollNumber(
    userEnrollNumber: number
  ): Promise<Pick<EmployeeRecord, 'employeeCode'> | null> {
    const pool = await getPool('wise-eye')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)

    const result = await request.query(`
      SELECT TOP 1
        u.UserFullCode
      FROM dbo.UserInfo u
      WHERE u.UserEnrollNumber = @userEnrollNumber
    `)

    const row = result.recordset[0]
    if (!row) return null

    return {
      employeeCode: row.UserFullCode
    }
  }
}
