import bcrypt from 'bcryptjs'
import { describe, expect, it } from 'vitest'
import { AuthService } from '../auth-service'

const buildEmployee = (employeeCode = 'E0112599') =>
  ({
    userEnrollNumber: 1,
    employeeCode,
    fullName: 'Nguyen Van A',
    isEnabled: true,
    schId: 1
  }) as any

const buildAppUser = (overrides?: Record<string, unknown>) =>
  ({
    userEnrollNumber: 1,
    employeeCode: 'E0112599',
    passwordHash: 'hash',
    isFirstLogin: false,
    isActiveApp: true,
    avatarBase64: null,
    boundHardwareId: null,
    ...overrides
  }) as any

describe('AuthService', () => {
  it('requires password change on first login when password matches employee code', async () => {
    const service = new AuthService({
      findEmployeeByCode: async (employeeCode) => buildEmployee(employeeCode),
      findAppUserByEnrollNumber: async () => null,
      findUserByHardwareId: async () => null,
      updateHardwareId: async () => undefined,
      upsertPassword: async () => undefined
    })

    const result = await service.login({
      employeeCode: 'E0112599',
      password: 'E0112599',
      rememberMe: true
    })

    expect(result.ok).toBe(true)
    expect(result.requiresPasswordChange).toBe(true)
    expect(result.user?.employeeCode).toBe('E0112599')
  })

  it('rejects disabled employees', async () => {
    const service = new AuthService({
      findEmployeeByCode: async (employeeCode) => ({
        ...buildEmployee(employeeCode),
        isEnabled: false,
      } as any),
      findAppUserByEnrollNumber: async () => null,
      findUserByHardwareId: async () => null,
      updateHardwareId: async () => undefined,
      upsertPassword: async () => undefined
    })

    const result = await service.login({
      employeeCode: 'E0112599',
      password: 'E0112599',
      rememberMe: true
    })

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Tài khoản đã bị vô hiệu hóa')
  })

  it('preserves password whitespace during login for changed passwords', async () => {
    const passwordHash = await bcrypt.hash(' 654321 ', 10)
    const service = new AuthService({
      findEmployeeByCode: async (employeeCode) => buildEmployee(employeeCode),
      findAppUserByEnrollNumber: async () => ({
        ...buildAppUser(),
        passwordHash,
      } as any),
      findUserByHardwareId: async () => null,
      updateHardwareId: async () => undefined,
      upsertPassword: async () => undefined
    })

    const result = await service.login({
      employeeCode: 'E0112599',
      password: ' 654321 ',
      rememberMe: true
    })

    expect(result.ok).toBe(true)
    expect(result.requiresPasswordChange).toBe(false)
  })

  it('rejects employee login when the app-level account is inactive', async () => {
    const passwordHash = await bcrypt.hash('123456', 10)
    const service = new AuthService({
      findEmployeeByCode: async (employeeCode) => buildEmployee(employeeCode),
      findAppUserByEnrollNumber: async () => ({
        ...buildAppUser(),
        passwordHash,
        isActiveApp: false
      } as any),
      findUserByHardwareId: async () => null,
      updateHardwareId: async () => undefined,
      upsertPassword: async () => undefined
    })

    const result = await service.login({
      employeeCode: 'E0112599',
      password: '123456',
      rememberMe: false
    })

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Tài khoản ứng dụng đã bị vô hiệu hóa')
  })

  it('temporarily locks login after 5 failed attempts for the same employee code', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10)
    const service = new AuthService({
      findEmployeeByCode: async (employeeCode) => buildEmployee(employeeCode),
      findAppUserByEnrollNumber: async () => ({
        ...buildAppUser(),
        passwordHash,
      } as any),
      findUserByHardwareId: async () => null,
      updateHardwareId: async () => undefined,
      upsertPassword: async () => undefined
    })

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.login({
        employeeCode: 'E0112599',
        password: 'wrong-password',
        rememberMe: false
      })
    }

    const lockedResult = await service.login({
      employeeCode: 'E0112599',
      password: 'correct-password',
      rememberMe: false
    })

    expect(lockedResult.ok).toBe(false)
    expect(lockedResult.message).toContain('khóa')
  })

  it('allows login from the bound device when device binding is enabled', async () => {
    const passwordHash = await bcrypt.hash('123456', 10)
    const service = new AuthService(
      {
        findEmployeeByCode: async (employeeCode) => buildEmployee(employeeCode),
        findAppUserByEnrollNumber: async () =>
          buildAppUser({
            passwordHash,
            boundHardwareId: 'hardware-1'
          }),
        findUserByHardwareId: async () =>
          buildAppUser({
            passwordHash,
            boundHardwareId: 'hardware-1'
          }),
        updateHardwareId: async () => undefined,
        upsertPassword: async () => undefined
      },
      undefined,
      async () => true
    )

    const result = await service.login(
      {
        employeeCode: 'E0112599',
        password: '123456',
        rememberMe: false
      },
      'hardware-1'
    )

    expect(result.ok).toBe(true)
  })

  it('blocks login when the account is bound to another device and enforcement is enabled', async () => {
    const passwordHash = await bcrypt.hash('123456', 10)
    const service = new AuthService(
      {
        findEmployeeByCode: async (employeeCode) => buildEmployee(employeeCode),
        findAppUserByEnrollNumber: async () =>
          buildAppUser({
            passwordHash,
            boundHardwareId: 'hardware-1'
          }),
        findUserByHardwareId: async () => null,
        updateHardwareId: async () => undefined,
        upsertPassword: async () => undefined
      },
      undefined,
      async () => true
    )

    const result = await service.login(
      {
        employeeCode: 'E0112599',
        password: '123456',
        rememberMe: false
      },
      'hardware-2'
    )

    expect(result.ok).toBe(false)
    expect(result.message).toBe(
      'Tài khoản của bạn đã được gắn với thiết bị khác. Vui lòng liên hệ quản trị viên.'
    )
  })

  it('blocks login when the device is already registered to another account', async () => {
    const passwordHash = await bcrypt.hash('123456', 10)
    const service = new AuthService(
      {
        findEmployeeByCode: async (employeeCode) => buildEmployee(employeeCode),
        findAppUserByEnrollNumber: async () =>
          buildAppUser({
            passwordHash,
            boundHardwareId: null
          }),
        findUserByHardwareId: async () =>
          ({
            userEnrollNumber: 99,
            employeeCode: 'E0999999',
            passwordHash,
            isFirstLogin: false,
            isActiveApp: true,
            avatarBase64: null,
            boundHardwareId: 'hardware-1'
          }) as any,
        updateHardwareId: async () => undefined,
        upsertPassword: async () => undefined
      },
      undefined,
      async () => true
    )

    const result = await service.login(
      {
        employeeCode: 'E0112599',
        password: '123456',
        rememberMe: false
      },
      'hardware-1'
    )

    expect(result.ok).toBe(false)
    expect(result.message).toBe(
      'Thiết bị này đã được đăng ký cho tài khoản khác. Vui lòng liên hệ quản trị viên.'
    )
  })

  it('bypasses enforcement when device binding is disabled', async () => {
    const passwordHash = await bcrypt.hash('123456', 10)
    const service = new AuthService(
      {
        findEmployeeByCode: async (employeeCode) => buildEmployee(employeeCode),
        findAppUserByEnrollNumber: async () =>
          buildAppUser({
            passwordHash,
            boundHardwareId: 'hardware-1'
          }),
        findUserByHardwareId: async () =>
          ({
            userEnrollNumber: 99,
            employeeCode: 'E0999999',
            passwordHash,
            isFirstLogin: false,
            isActiveApp: true,
            avatarBase64: null,
            boundHardwareId: 'hardware-2'
          }) as any,
        updateHardwareId: async () => undefined,
        upsertPassword: async () => undefined
      },
      undefined,
      async () => false
    )

    const result = await service.login(
      {
        employeeCode: 'E0112599',
        password: '123456',
        rememberMe: false
      },
      'hardware-2'
    )

    expect(result.ok).toBe(true)
  })

  it('auto-binds the hardware id after a successful first login even when enforcement is off', async () => {
    const updateHardwareId = vi.fn(async () => undefined)
    const service = new AuthService(
      {
        findEmployeeByCode: async (employeeCode) => buildEmployee(employeeCode),
        findAppUserByEnrollNumber: async () => null,
        findUserByHardwareId: async () => null,
        updateHardwareId,
        upsertPassword: async () => undefined
      },
      undefined,
      async () => false
    )

    const result = await service.login(
      {
        employeeCode: 'E0112599',
        password: 'E0112599',
        rememberMe: true
      },
      'hardware-1'
    )

    expect(result.ok).toBe(true)
    expect(updateHardwareId).toHaveBeenCalledWith(1, 'hardware-1')
  })
})
