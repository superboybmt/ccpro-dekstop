import { AdminSettingsService } from '../admin-settings-service'

describe('AdminSettingsService', () => {
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
