import bcrypt from 'bcryptjs'
import { describe, expect, it, vi } from 'vitest'
import { AdminUserManagementService } from '../admin-user-management-service'

const buildEmployee = () => ({
  userEnrollNumber: 18,
  employeeCode: 'E0112599',
  fullName: 'Phan Thuy',
  department: 'IT',
  scheduleName: 'Hành chánh',
  wiseEyeEnabled: true
})

describe('AdminUserManagementService', () => {
  it('lists users by combining WiseEye employees with app account state', async () => {
    const service = new AdminUserManagementService({
      listEmployeeDirectory: async () => [buildEmployee()],
      findEmployeeByEnrollNumber: async () => buildEmployee(),
      listAppUsersByEnrollNumbers: async () => [
        {
          userEnrollNumber: 18,
          employeeCode: 'E0112599',
          passwordHash: 'hash',
          isFirstLogin: false,
          isActiveApp: false
        }
      ],
      findAppUserByEnrollNumber: async () => null,
      upsertManagedUser: async () => undefined,
      insertAuditLog: async () => undefined
    })

    await expect(service.listUsers({ query: 'phan' })).resolves.toEqual({
      users: [
        {
          userEnrollNumber: 18,
          employeeCode: 'E0112599',
          fullName: 'Phan Thuy',
          department: 'IT',
          scheduleName: 'Hành chánh',
          wiseEyeEnabled: true,
          appActive: false,
          hasAppAccount: true,
          mustChangePassword: false
        }
      ]
    })
  })

  it('deactivates a user and writes an audit log', async () => {
    const upsertManagedUser = vi.fn<any>(async () => undefined)
    const insertAuditLog = vi.fn<any>(async () => undefined)
    const existingHash = await bcrypt.hash('123456', 10)

    const service = new AdminUserManagementService({
      listEmployeeDirectory: async () => [],
      findEmployeeByEnrollNumber: async () => buildEmployee(),
      listAppUsersByEnrollNumbers: async () => [],
      findAppUserByEnrollNumber: async () => ({
        userEnrollNumber: 18,
        employeeCode: 'E0112599',
        passwordHash: existingHash,
        isFirstLogin: false,
        isActiveApp: true
      }),
      upsertManagedUser,
      insertAuditLog
    })

    await expect(service.setUserActiveState({ userEnrollNumber: 18, isActive: false }, 7)).resolves.toEqual({
      ok: true,
      message: 'Đã vô hiệu hóa tài khoản ứng dụng'
    })

    expect(upsertManagedUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userEnrollNumber: 18,
        isActiveApp: false,
        updatedByAdminId: 7
      })
    )
    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 7,
        userEnrollNumber: 18,
        action: 'deactivate'
      })
    )
  })

  it('resets a password, preserves app activation state, and forces password change', async () => {
    const upsertManagedUser = vi.fn<any>(async () => undefined)
    const insertAuditLog = vi.fn<any>(async () => undefined)

    const service = new AdminUserManagementService({
      listEmployeeDirectory: async () => [],
      findEmployeeByEnrollNumber: async () => buildEmployee(),
      listAppUsersByEnrollNumbers: async () => [],
      findAppUserByEnrollNumber: async () => ({
        userEnrollNumber: 18,
        employeeCode: 'E0112599',
        passwordHash: 'old-hash',
        isFirstLogin: false,
        isActiveApp: false
      }),
      upsertManagedUser,
      insertAuditLog
    })

    await expect(
      service.resetUserPassword({ userEnrollNumber: 18, temporaryPassword: 'Temp@123' }, 9)
    ).resolves.toEqual({
      ok: true,
      message: 'Đã reset mật khẩu tạm và yêu cầu đổi lại ở lần đăng nhập tiếp theo'
    })

    const upsertArgs = upsertManagedUser.mock.calls[0]?.[0] as any
    expect(upsertArgs).toMatchObject({
      userEnrollNumber: 18,
      isFirstLogin: true,
      isActiveApp: false,
      updatedByAdminId: 9
    })
    expect(await bcrypt.compare('Temp@123', upsertArgs.passwordHash)).toBe(true)
    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reset-password'
      })
    )
  })
})
