import type { MutationResult, RemoteRiskPolicy, RemoteRiskPolicyMode } from '@shared/api'
import { getPool } from '../db/sql'
import { formatSqlDateTime } from './sql-datetime'

const REMOTE_RISK_GUARD_MODE_KEY = 'remote_risk_guard_mode'
const DEFAULT_REMOTE_RISK_POLICY_MODE: RemoteRiskPolicyMode = 'audit_only'
const DEVICE_BINDING_ENABLED_KEY = 'device_binding_enabled'

export interface AdminSettingsRepository {
  getSetting(key: string): Promise<string | null>
  upsertSetting(key: string, value: string): Promise<void>
}

export class AdminSettingsService {
  constructor(private readonly repository: AdminSettingsRepository) {}

  async getDeviceBindingEnabled(): Promise<boolean> {
    return normalizeDeviceBindingEnabled(await this.repository.getSetting(DEVICE_BINDING_ENABLED_KEY))
  }

  async saveDeviceBindingEnabled(enabled: boolean): Promise<MutationResult> {
    await this.repository.upsertSetting(DEVICE_BINDING_ENABLED_KEY, enabled ? 'on' : 'off')

    return {
      ok: true,
      message: enabled
        ? 'Đã bật ràng buộc thiết bị đăng nhập'
        : 'Đã tắt ràng buộc thiết bị đăng nhập'
    }
  }

  async getRemoteRiskPolicy(): Promise<RemoteRiskPolicy> {
    const rawMode = await this.repository.getSetting(REMOTE_RISK_GUARD_MODE_KEY)

    return {
      mode: normalizeRemoteRiskPolicyMode(rawMode)
    }
  }

  async saveRemoteRiskPolicy(policy: RemoteRiskPolicy): Promise<MutationResult & RemoteRiskPolicy> {
    const mode = normalizeRemoteRiskPolicyMode(policy.mode)
    await this.repository.upsertSetting(REMOTE_RISK_GUARD_MODE_KEY, mode)

    return {
      ok: true,
      message:
        mode === 'block_high_risk'
          ? 'Đã lưu cấu hình chặn điều khiển từ xa'
          : 'Đã lưu cấu hình chỉ ghi nhận điều khiển từ xa',
      mode
    }
  }
}

export class SqlAdminSettingsRepository implements AdminSettingsRepository {
  async getSetting(key: string): Promise<string | null> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('settingKey', key)

    const result = await request.query(`
      SELECT TOP 1 setting_value
      FROM dbo.app_settings
      WHERE setting_key = @settingKey
    `)

    return result.recordset[0]?.setting_value ?? null
  }

  async upsertSetting(key: string, value: string): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('settingKey', key)
    request.input('settingValue', value)
    request.input('now', formatSqlDateTime(new Date()))

    await request.query(`
      MERGE dbo.app_settings AS target
      USING (
        SELECT
          @settingKey AS setting_key,
          @settingValue AS setting_value
      ) AS source
      ON target.setting_key = source.setting_key
      WHEN MATCHED THEN
        UPDATE SET
          setting_value = source.setting_value,
          updated_at = CONVERT(datetime2, @now, 120)
      WHEN NOT MATCHED THEN
        INSERT (
          setting_key,
          setting_value,
          updated_at
        )
        VALUES (
          source.setting_key,
          source.setting_value,
          CONVERT(datetime2, @now, 120)
        );
    `)
  }
}

const normalizeRemoteRiskPolicyMode = (value: string | null | undefined): RemoteRiskPolicyMode =>
  value === 'block_high_risk' ? 'block_high_risk' : DEFAULT_REMOTE_RISK_POLICY_MODE

const normalizeDeviceBindingEnabled = (value: string | null | undefined): boolean => value === 'on'

export const __internal = {
  normalizeRemoteRiskPolicyMode,
  normalizeDeviceBindingEnabled,
  DEVICE_BINDING_ENABLED_KEY,
  REMOTE_RISK_GUARD_MODE_KEY,
  DEFAULT_REMOTE_RISK_POLICY_MODE
}
