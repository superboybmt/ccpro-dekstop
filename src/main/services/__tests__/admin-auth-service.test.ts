import bcrypt from 'bcryptjs'
import { AdminAuthService, type AdminAuthRepository } from '../admin-auth-service'

const createRepository = (): AdminAuthRepository => ({
  findByUsername: vi.fn(async () => null),
  findById: vi.fn(async () => null),
  listAdmins: vi.fn(async () => []),
  updateLastLogin: vi.fn(async () => undefined),
  updatePassword: vi.fn(async () => undefined),
  logAuthAudit: vi.fn(async () => undefined),
  countAdmins: vi.fn(async () => 0),
  createAdmin: vi.fn(async () => undefined)
})

describe('AdminAuthService', () => {
  it('logs in an active admin and updates the last-login timestamp', async () => {
    const repository = createRepository()
    const passwordHash = await bcrypt.hash('secret', 4)

    vi.mocked(repository.findByUsername).mockResolvedValue({
      id: 7,
      username: 'admin',
      passwordHash,
      displayName: 'Administrator',
      role: 'admin',
      isActive: true,
      mustChangePassword: false
    })

    const service = new AdminAuthService(repository)

    await expect(service.login({ username: 'Admin', password: 'secret' })).resolves.toEqual({
      ok: true,
      requiresPasswordChange: false,
      admin: {
        id: 7,
        username: 'admin',
        displayName: 'Administrator',
        role: 'admin'
      }
    })

    expect(repository.updateLastLogin).toHaveBeenCalledWith(7)
  })

  it('rejects inactive admins', async () => {
    const repository = createRepository()
    const passwordHash = await bcrypt.hash('secret', 4)

    vi.mocked(repository.findByUsername).mockResolvedValue({
      id: 8,
      username: 'locked',
      passwordHash,
      displayName: 'Locked Admin',
      role: 'admin',
      isActive: false,
      mustChangePassword: false
    })

    const service = new AdminAuthService(repository)

    await expect(service.login({ username: 'locked', password: 'secret' })).resolves.toEqual({
      ok: false,
      message: 'Tài khoản đã bị vô hiệu hóa',
      requiresPasswordChange: false
    })
  })

  it('marks login as requiring password change when admin uses a temporary password', async () => {
    const repository = createRepository()
    const passwordHash = await bcrypt.hash('Temp@123', 4)

    vi.mocked(repository.findByUsername).mockResolvedValue({
      id: 11,
      username: 'ops-admin',
      passwordHash,
      displayName: 'Ops Admin',
      role: 'admin',
      isActive: true,
      mustChangePassword: true
    })

    const service = new AdminAuthService(repository)

    await expect(service.login({ username: 'ops-admin', password: 'Temp@123' })).resolves.toEqual({
      ok: true,
      requiresPasswordChange: true,
      admin: {
        id: 11,
        username: 'ops-admin',
        displayName: 'Ops Admin',
        role: 'admin'
      }
    })
  })

  it('rejects self-service password change when the current password is wrong', async () => {
    const repository = createRepository()
    const currentPasswordHash = await bcrypt.hash('correct-password', 4)

    vi.mocked(repository.findById).mockResolvedValue({
      id: 9,
      username: 'admin',
      passwordHash: currentPasswordHash,
      displayName: 'Administrator',
      role: 'admin',
      isActive: true,
      mustChangePassword: true
    })

    const service = new AdminAuthService(repository)

    await expect(
      service.changePassword(
        {
          id: 9,
          username: 'admin',
          displayName: 'Administrator',
          role: 'admin'
        },
        {
          currentPassword: 'wrong-password',
          newPassword: 'NewSecret@123',
          confirmPassword: 'NewSecret@123'
        }
      )
    ).resolves.toEqual({
      ok: false,
      message: 'Mật khẩu hiện tại không đúng'
    })

    expect(repository.updatePassword).not.toHaveBeenCalled()
  })

  it('changes the current admin password and clears forced-change state', async () => {
    const repository = createRepository()
    const currentPasswordHash = await bcrypt.hash('OldSecret@123', 4)

    vi.mocked(repository.findById).mockResolvedValue({
      id: 10,
      username: 'admin',
      passwordHash: currentPasswordHash,
      displayName: 'Administrator',
      role: 'admin',
      isActive: true,
      mustChangePassword: true
    })

    const service = new AdminAuthService(repository)

    await expect(
      service.changePassword(
        {
          id: 10,
          username: 'admin',
          displayName: 'Administrator',
          role: 'admin'
        },
        {
          currentPassword: 'OldSecret@123',
          newPassword: 'NewSecret@123',
          confirmPassword: 'NewSecret@123'
        }
      )
    ).resolves.toEqual({
      ok: true,
      message: 'Đổi mật khẩu admin thành công'
    })

    expect(repository.updatePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 10,
        mustChangePassword: false
      })
    )
    expect(repository.logAuthAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorAdminId: 10,
        targetAdminId: 10,
        action: 'self-change-password',
        status: 'success'
      })
    )
  })

  it('resets another admin password to a temporary one and forces password change on next login', async () => {
    const repository = createRepository()
    vi.mocked(repository.findById).mockResolvedValue({
      id: 12,
      username: 'support-admin',
      passwordHash: 'old-hash',
      displayName: 'Support Admin',
      role: 'admin',
      isActive: true,
      mustChangePassword: false
    })

    const service = new AdminAuthService(repository)

    await expect(
      service.resetPassword(
        {
          adminId: 12,
          temporaryPassword: 'Temp@123'
        },
        1
      )
    ).resolves.toEqual({
      ok: true,
      message: 'Đã reset mật khẩu admin tạm và yêu cầu đổi lại ở lần đăng nhập tiếp theo'
    })

    expect(repository.updatePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 12,
        mustChangePassword: true
      })
    )
    expect(repository.logAuthAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorAdminId: 1,
        targetAdminId: 12,
        action: 'admin-reset-password',
        status: 'success'
      })
    )
  })

  it('supports emergency local password reset without an authenticated admin session', async () => {
    const repository = createRepository()
    vi.mocked(repository.findByUsername).mockResolvedValue({
      id: 15,
      username: 'admin',
      passwordHash: 'old-hash',
      displayName: 'Administrator',
      role: 'admin',
      isActive: true,
      mustChangePassword: false
    })

    const service = new AdminAuthService(repository)

    await expect(
      service.resetPasswordEmergency({
        username: 'admin',
        temporaryPassword: 'Temp@999'
      })
    ).resolves.toEqual({
      ok: true,
      message: 'Đã reset mật khẩu admin khẩn cấp. Hãy đăng nhập và đổi lại mật khẩu ngay.'
    })

    expect(repository.updatePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 15,
        mustChangePassword: true
      })
    )
    expect(repository.logAuthAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorAdminId: null,
        targetAdminId: 15,
        action: 'emergency-reset-password',
        status: 'success'
      })
    )
  })
})
