import bcrypt from 'bcryptjs'
import { describe, expect, it } from 'vitest'
import { AuthService } from '../auth-service'

describe('AuthService', () => {
  it('requires password change on first login when password matches employee code', async () => {
    const service = new AuthService({
      findEmployeeByCode: async (employeeCode) => ({
        userEnrollNumber: 1,
        employeeCode,
        fullName: 'Nguyen Van A',
        isEnabled: true,
        schId: 1
      }),
      findAppUserByEnrollNumber: async () => null,
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
        userEnrollNumber: 1,
        employeeCode,
        fullName: 'Nguyen Van A',
        isEnabled: false,
        schId: 1
      }),
      findAppUserByEnrollNumber: async () => null,
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
      findEmployeeByCode: async (employeeCode) => ({
        userEnrollNumber: 1,
        employeeCode,
        fullName: 'Nguyen Van A',
        isEnabled: true,
        schId: 1
      }),
      findAppUserByEnrollNumber: async () => ({
        userEnrollNumber: 1,
        employeeCode: 'E0112599',
        passwordHash,
        isFirstLogin: false,
        isActiveApp: true
      }),
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
      findEmployeeByCode: async (employeeCode) => ({
        userEnrollNumber: 1,
        employeeCode,
        fullName: 'Nguyen Van A',
        isEnabled: true,
        schId: 1
      }),
      findAppUserByEnrollNumber: async () => ({
        userEnrollNumber: 1,
        employeeCode: 'E0112599',
        passwordHash,
        isFirstLogin: false,
        isActiveApp: false
      }),
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
})
