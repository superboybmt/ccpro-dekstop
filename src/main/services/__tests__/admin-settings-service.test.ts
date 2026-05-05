import { AdminSettingsService } from '../admin-settings-service'

describe('AdminSettingsService', () => {
  it('returns false when device binding has not been configured yet', async () => {
    const repository = {
      getSetting: vi.fn(async () => null),
      upsertSetting: vi.fn(async () => undefined)
    }

    const service = new AdminSettingsService(repository)

    await expect(service.getDeviceBindingEnabled()).resolves.toBe(false)
  })

  it('persists the enabled device binding toggle using the device binding setting key', async () => {
    const repository = {
      getSetting: vi.fn(async () => null),
      upsertSetting: vi.fn(async () => undefined)
    }

    const service = new AdminSettingsService(repository)

    await expect(service.saveDeviceBindingEnabled(true)).resolves.toEqual({
      ok: true,
      message: 'Đã bật ràng buộc thiết bị đăng nhập'
    })

    expect(repository.upsertSetting).toHaveBeenCalledWith('device_binding_enabled', 'on')
  })

  it('returns audit_only when remote-risk policy has not been configured yet', async () => {
    const repository = {
      getSetting: vi.fn(async () => null),
      upsertSetting: vi.fn(async () => undefined)
    }

    const service = new AdminSettingsService(repository)

    await expect(service.getRemoteRiskPolicy()).resolves.toEqual({
      mode: 'audit_only'
    })
  })

  it('persists block_high_risk and returns a success message', async () => {
    const repository = {
      getSetting: vi.fn(async () => null),
      upsertSetting: vi.fn(async () => undefined)
    }

    const service = new AdminSettingsService(repository)

    await expect(service.saveRemoteRiskPolicy({ mode: 'block_high_risk' })).resolves.toEqual({
      ok: true,
      message: 'Đã lưu cấu hình chặn điều khiển từ xa',
      mode: 'block_high_risk'
    })

    expect(repository.upsertSetting).toHaveBeenCalledWith('remote_risk_guard_mode', 'block_high_risk')
  })
})
