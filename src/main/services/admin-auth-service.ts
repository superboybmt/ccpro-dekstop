import bcrypt from 'bcryptjs'
import type {
  AdminAccount,
  AdminAccountList,
  AdminLoginPayload,
  AdminLoginResult,
  AdminResetAdminPasswordPayload,
  AdminUser,
  ChangePasswordPayload,
  MutationResult
} from '@shared/api'
import { getPool } from '../db/sql'
import { SlidingWindowRateLimiter, formatLockoutMessage } from './rate-limiter'
import { formatSqlDateTime } from './sql-datetime'

const INVALID_CREDENTIALS_MESSAGE = 'Sai tên đăng nhập hoặc mật khẩu'

export interface AdminRecord {
  id: number
  username: string
  passwordHash: string
  displayName: string
  role: string
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt?: string | null
}

interface UpdateAdminPasswordArgs {
  adminId: number
  passwordHash: string
  mustChangePassword: boolean
}

interface AdminAuthAuditEntry {
  actorAdminId: number | null
  targetAdminId: number
  action: 'self-change-password' | 'admin-reset-password' | 'emergency-reset-password'
  status: 'success'
  metadataJson?: string | null
}

export interface AdminAuthRepository {
  findByUsername(username: string): Promise<AdminRecord | null>
  findById(adminId: number): Promise<AdminRecord | null>
  listAdmins(): Promise<AdminAccount[]>
  updateLastLogin(adminId: number): Promise<void>
  updatePassword(args: UpdateAdminPasswordArgs): Promise<void>
  logAuthAudit(entry: AdminAuthAuditEntry): Promise<void>
  countAdmins(): Promise<number>
  createAdmin(args: {
    username: string
    passwordHash: string
    displayName: string
    role: string
  }): Promise<void>
}

const toAdminUser = (admin: AdminRecord): AdminUser => ({
  id: admin.id,
  username: admin.username,
  displayName: admin.displayName,
  role: admin.role
})

const validatePasswordChange = (payload: ChangePasswordPayload): MutationResult | null => {
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

  return null
}

const validateTemporaryPassword = (temporaryPassword: string): MutationResult | null => {
  if (temporaryPassword.length < 6) {
    return {
      ok: false,
      message: 'Mật khẩu tạm phải có ít nhất 6 ký tự'
    }
  }

  return null
}

const validateBootstrapArgs = (args: {
  username: string
  password: string
  displayName: string
}): MutationResult | null => {
  if (!args.username.trim()) {
    return {
      ok: false,
      message: 'Tên đăng nhập admin không được để trống'
    }
  }

  if (!args.displayName.trim()) {
    return {
      ok: false,
      message: 'Tên hiển thị admin không được để trống'
    }
  }

  if (args.password.length < 6) {
    return {
      ok: false,
      message: 'Mật khẩu admin phải có ít nhất 6 ký tự'
    }
  }

  return null
}

export class AdminAuthService {
  constructor(
    private readonly repository: AdminAuthRepository,
    private readonly rateLimiter = new SlidingWindowRateLimiter()
  ) {}

  async login(payload: AdminLoginPayload): Promise<AdminLoginResult> {
    const username = payload.username.trim().toLowerCase()
    const lockout = this.rateLimiter.getLockout(username)
    if (lockout.locked) {
      return {
        ok: false,
        message: formatLockoutMessage(lockout.remainingMs),
        requiresPasswordChange: false
      }
    }

    const admin = await this.repository.findByUsername(username)

    if (!admin) {
      this.rateLimiter.recordFailure(username)
      return { ok: false, message: INVALID_CREDENTIALS_MESSAGE, requiresPasswordChange: false }
    }

    if (!admin.isActive) {
      this.rateLimiter.recordFailure(username)
      return { ok: false, message: 'Tài khoản đã bị vô hiệu hóa', requiresPasswordChange: false }
    }

    const passwordMatches = await bcrypt.compare(payload.password, admin.passwordHash)
    if (!passwordMatches) {
      this.rateLimiter.recordFailure(username)
      return { ok: false, message: INVALID_CREDENTIALS_MESSAGE, requiresPasswordChange: false }
    }

    await this.repository.updateLastLogin(admin.id)
    this.rateLimiter.reset(username)

    return {
      ok: true,
      requiresPasswordChange: admin.mustChangePassword,
      admin: toAdminUser(admin)
    }
  }

  async changePassword(admin: AdminUser, payload: ChangePasswordPayload): Promise<MutationResult> {
    const validationError = validatePasswordChange(payload)
    if (validationError) {
      return validationError
    }

    const currentAdmin = await this.repository.findById(admin.id)
    if (!currentAdmin) {
      return {
        ok: false,
        message: INVALID_CREDENTIALS_MESSAGE
      }
    }

    const currentPasswordMatches = await bcrypt.compare(payload.currentPassword, currentAdmin.passwordHash)
    if (!currentPasswordMatches) {
      return {
        ok: false,
        message: 'Mật khẩu hiện tại không đúng'
      }
    }

    const passwordHash = await bcrypt.hash(payload.newPassword, 10)
    await this.repository.updatePassword({
      adminId: admin.id,
      passwordHash,
      mustChangePassword: false
    })
    await this.repository.logAuthAudit({
      actorAdminId: admin.id,
      targetAdminId: admin.id,
      action: 'self-change-password',
      status: 'success'
    })

    return {
      ok: true,
      message: 'Đổi mật khẩu admin thành công'
    }
  }

  async listAdmins(): Promise<AdminAccountList> {
    return {
      admins: await this.repository.listAdmins()
    }
  }

  async resetPassword(payload: AdminResetAdminPasswordPayload, actorAdminId: number): Promise<MutationResult> {
    const validationError = validateTemporaryPassword(payload.temporaryPassword)
    if (validationError) {
      return validationError
    }

    if (payload.adminId === actorAdminId) {
      return {
        ok: false,
        message: 'Hãy dùng chức năng đổi mật khẩu cho tài khoản hiện tại'
      }
    }

    const targetAdmin = await this.repository.findById(payload.adminId)
    if (!targetAdmin) {
      return {
        ok: false,
        message: 'Không tìm thấy tài khoản admin'
      }
    }

    const passwordHash = await bcrypt.hash(payload.temporaryPassword, 10)
    await this.repository.updatePassword({
      adminId: payload.adminId,
      passwordHash,
      mustChangePassword: true
    })
    await this.repository.logAuthAudit({
      actorAdminId,
      targetAdminId: payload.adminId,
      action: 'admin-reset-password',
      status: 'success'
    })

    return {
      ok: true,
      message: 'Đã reset mật khẩu admin tạm và yêu cầu đổi lại ở lần đăng nhập tiếp theo'
    }
  }

  async resetPasswordEmergency(args: {
    username: string
    temporaryPassword: string
  }): Promise<MutationResult> {
    const validationError = validateTemporaryPassword(args.temporaryPassword)
    if (validationError) {
      return validationError
    }

    const username = args.username.trim().toLowerCase()
    const targetAdmin = await this.repository.findByUsername(username)
    if (!targetAdmin) {
      return {
        ok: false,
        message: 'Không tìm thấy tài khoản admin'
      }
    }

    const passwordHash = await bcrypt.hash(args.temporaryPassword, 10)
    await this.repository.updatePassword({
      adminId: targetAdmin.id,
      passwordHash,
      mustChangePassword: true
    })
    await this.repository.logAuthAudit({
      actorAdminId: null,
      targetAdminId: targetAdmin.id,
      action: 'emergency-reset-password',
      status: 'success'
    })

    return {
      ok: true,
      message: 'Đã reset mật khẩu admin khẩn cấp. Hãy đăng nhập và đổi lại mật khẩu ngay.'
    }
  }

  async bootstrapFirstAdmin(args: {
    username: string
    password: string
    displayName: string
  }): Promise<{ ok: boolean; message: string }> {
    const count = await this.repository.countAdmins()
    if (count > 0) {
      return { ok: false, message: 'Admin đã tồn tại, không cần bootstrap' }
    }

    const validationError = validateBootstrapArgs(args)
    if (validationError) {
      return validationError
    }

    const passwordHash = await bcrypt.hash(args.password, 10)
    await this.repository.createAdmin({
      username: args.username.trim().toLowerCase(),
      passwordHash,
      displayName: args.displayName.trim(),
      role: 'admin'
    })

    return { ok: true, message: 'Tạo admin đầu tiên thành công' }
  }
}

export class SqlAdminAuthRepository implements AdminAuthRepository {
  async findByUsername(username: string): Promise<AdminRecord | null> {
    return this.findOne('username = @username', { username })
  }

  async findById(adminId: number): Promise<AdminRecord | null> {
    return this.findOne('id = @adminId', { adminId })
  }

  async listAdmins(): Promise<AdminAccount[]> {
    const pool = await getPool('app')
    const result = await pool.request().query(`
      SELECT
        id,
        username,
        display_name,
        role,
        is_active,
        must_change_password,
        CONVERT(varchar(19), last_login_at, 120) AS last_login_at
      FROM dbo.app_admins
      ORDER BY username ASC
    `)

    return result.recordset.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      isActive: row.is_active,
      mustChangePassword: row.must_change_password,
      lastLoginAt: row.last_login_at ?? null
    }))
  }

  async updateLastLogin(adminId: number): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('adminId', adminId)
    request.input('now', formatSqlDateTime(new Date()))

    await request.query(`
      UPDATE dbo.app_admins
      SET last_login_at = CONVERT(datetime2, @now, 120),
          updated_at = CONVERT(datetime2, @now, 120)
      WHERE id = @adminId
    `)
  }

  async updatePassword(args: UpdateAdminPasswordArgs): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('adminId', args.adminId)
    request.input('passwordHash', args.passwordHash)
    request.input('mustChangePassword', args.mustChangePassword)
    request.input('changedAt', formatSqlDateTime(new Date()))

    await request.query(`
      UPDATE dbo.app_admins
      SET password_hash = @passwordHash,
          must_change_password = @mustChangePassword,
          password_changed_at = CONVERT(datetime2, @changedAt, 120),
          updated_at = CONVERT(datetime2, @changedAt, 120)
      WHERE id = @adminId
    `)
  }

  async logAuthAudit(entry: AdminAuthAuditEntry): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('actorAdminId', entry.actorAdminId)
    request.input('targetAdminId', entry.targetAdminId)
    request.input('action', entry.action)
    request.input('status', entry.status)
    request.input('metadataJson', entry.metadataJson ?? null)
    request.input('createdAt', formatSqlDateTime(new Date()))

    await request.query(`
      INSERT INTO dbo.admin_auth_audit_logs (
        actor_admin_id,
        target_admin_id,
        action,
        status,
        metadata_json,
        created_at
      )
      VALUES (
        @actorAdminId,
        @targetAdminId,
        @action,
        @status,
        @metadataJson,
        CONVERT(datetime2, @createdAt, 120)
      )
    `)
  }

  async countAdmins(): Promise<number> {
    const pool = await getPool('app')
    const result = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.app_admins')
    return result.recordset[0].cnt
  }

  async createAdmin(args: {
    username: string
    passwordHash: string
    displayName: string
    role: string
  }): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('username', args.username)
    request.input('passwordHash', args.passwordHash)
    request.input('displayName', args.displayName)
    request.input('role', args.role)
    request.input('now', formatSqlDateTime(new Date()))

    await request.query(`
      INSERT INTO dbo.app_admins (
        username,
        password_hash,
        display_name,
        role,
        is_active,
        must_change_password,
        password_changed_at,
        created_at,
        updated_at
      )
      VALUES (
        @username,
        @passwordHash,
        @displayName,
        @role,
        1,
        0,
        CONVERT(datetime2, @now, 120),
        CONVERT(datetime2, @now, 120),
        CONVERT(datetime2, @now, 120)
      )
    `)
  }

  private async findOne(whereClause: string, params: Record<string, string | number>): Promise<AdminRecord | null> {
    const pool = await getPool('app')
    const request = pool.request()

    for (const [key, value] of Object.entries(params)) {
      request.input(key, value)
    }

    const result = await request.query(`
      SELECT TOP 1
        id,
        username,
        password_hash,
        display_name,
        role,
        is_active,
        must_change_password,
        CONVERT(varchar(19), last_login_at, 120) AS last_login_at
      FROM dbo.app_admins
      WHERE ${whereClause}
    `)

    const row = result.recordset[0]
    if (!row) return null

    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      displayName: row.display_name,
      role: row.role,
      isActive: row.is_active,
      mustChangePassword: row.must_change_password,
      lastLoginAt: row.last_login_at ?? null
    }
  }
}
