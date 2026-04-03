import { execFile as execFileCallback } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { DeviceConfig, DeviceConfigPayload, DeviceConfigResult, MutationResult } from '@shared/api'
import { appConfig } from '../config/app-config'
import { getPool } from '../db/sql'
import { formatSqlDateTime } from './sql-datetime'

const execFile = promisify(execFileCallback)
const helperResourceSegments = ['machine-config', 'machine-config-helper.exe'] as const
const helperTimeoutMs = {
  'preflight-sdk': 30_000,
  'get-config': 30_000,
  'save-config': 120_000,
  'sync-time': 30_000,
  'bootstrap-app-config': 30_000
} as const

const machineConfigDiagnosticFallback =
  'Machine config helper exited before returning diagnostics. The target machine may be missing a bundled runtime dependency such as MSVBVM60.DLL.'

const resolveMachineConfigHelperPath = (): string => {
  const override = process.env.CCPRO_MACHINE_CONFIG_HELPER_PATH?.trim()
  if (override) {
    return override
  }

  const devPath = join(process.cwd(), 'build', ...helperResourceSegments)
  if (existsSync(devPath)) {
    return devPath
  }

  return join(process.resourcesPath, ...helperResourceSegments)
}

const runMachineConfigHelper = async (
  command: 'preflight-sdk' | 'get-config' | 'save-config' | 'sync-time' | 'bootstrap-app-config',
  args: string[]
): Promise<string> => {
  const helperPath = resolveMachineConfigHelperPath()
  const { stdout } = await execFile(helperPath, [command, ...args], {
    timeout: helperTimeoutMs[command]
  })
  return stdout
}

const parseHelperJson = <T>(output: string): T => JSON.parse(output) as T

const extractHelperErrorMessage = (error: unknown): string => {
  const stdout = typeof error === 'object' && error !== null && 'stdout' in error ? String(error.stdout ?? '') : ''
  const stderr = typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr ?? '') : ''

  for (const candidate of [stdout, stderr]) {
    const trimmed = candidate.trim()
    if (!trimmed) continue

    try {
      const parsed = parseHelperJson<{ message?: string }>(trimmed)
      if (parsed.message?.trim()) {
        return parsed.message.trim()
      }
    } catch {
      if (trimmed) {
        return trimmed
      }
    }
  }

  if (error instanceof Error && /Command failed: .*machine-config-helper\.exe/i.test(error.message)) {
    return `${machineConfigDiagnosticFallback} Original error: ${error.message}`
  }

  return error instanceof Error ? error.message : String(error)
}

type HelperBaseArgs = {
  deviceIp: string
  devicePort: number
  devicePassword: number
}

type HelperSaveResult = DeviceConfigResult
type AppConfigBootstrapResult = {
  ok: boolean
  message: string
  outputPath: string
}

type MachineConfigSdkPreflightResult = {
  ok: boolean
  message: string
}

const buildHelperConnectionArgs = (args: HelperBaseArgs): string[] => [
  '--ip', args.deviceIp,
  '--port', String(args.devicePort),
  '--password', String(args.devicePassword)
]

export const bootstrapLocalAppConfig = async (args: {
  outputPath: string
  seedPath: string
}): Promise<AppConfigBootstrapResult> => {
  const output = await runMachineConfigHelper('bootstrap-app-config', [
    '--output', args.outputPath,
    '--seed', args.seedPath
  ])

  return parseHelperJson<AppConfigBootstrapResult>(output)
}

const ensureMachineConfigSdkReady = async (): Promise<void> => {
  try {
    const output = await runMachineConfigHelper('preflight-sdk', [])
    const result = parseHelperJson<MachineConfigSdkPreflightResult>(output)

    if (!result.ok) {
      throw new Error(result.message)
    }
  } catch (error) {
    throw new Error(extractHelperErrorMessage(error))
  }
}

export interface MachineConfigService {
  getConfig(): Promise<DeviceConfig>
  saveConfig(payload: DeviceConfigPayload, adminId: number): Promise<DeviceConfigResult>
  syncTime(adminId: number): Promise<MutationResult>
}

export class ZkMachineConfigService implements MachineConfigService {
  private readonly deviceIp: string
  private readonly devicePort: number
  private readonly devicePassword?: number

  constructor(options?: { deviceIp?: string; devicePort?: number; devicePassword?: number }) {
    this.deviceIp = options?.deviceIp ?? appConfig.deviceSync.ip
    this.devicePort = options?.devicePort ?? appConfig.deviceSync.port
    this.devicePassword = options?.devicePassword ?? appConfig.deviceSync.password
  }

  async getConfig(): Promise<DeviceConfig> {
    await ensureMachineConfigSdkReady()

    try {
      const output = await runMachineConfigHelper('get-config', buildHelperConnectionArgs({
        deviceIp: this.deviceIp,
        devicePort: this.devicePort,
        devicePassword: this.getDevicePassword()
      }))

      return parseHelperJson<DeviceConfig>(output)
    } catch (error) {
      throw new Error(extractHelperErrorMessage(error))
    }
  }

  async saveConfig(payload: DeviceConfigPayload, adminId: number): Promise<DeviceConfigResult> {
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64')

    try {
      await ensureMachineConfigSdkReady()

      const output = await runMachineConfigHelper(
        'save-config',
        [
          ...buildHelperConnectionArgs({
            deviceIp: this.deviceIp,
            devicePort: this.devicePort,
            devicePassword: this.getDevicePassword()
          }),
          '--payloadB64', payloadB64
        ]
      )

      const result = parseHelperJson<HelperSaveResult>(output)
      await this.writeAuditLog({
        adminId,
        action: 'save-config',
        before: result.before ?? { stateMode: payload.stateMode, schedule: payload.schedule },
        after: result.after ?? null,
        status: result.ok ? 'success' : 'failed',
        errorMessage: result.ok ? null : result.message
      })

      return result
    } catch (error) {
      const errorMessage = extractHelperErrorMessage(error)

      await this.writeAuditLog({
        adminId,
        action: 'save-config',
        before: { stateMode: payload.stateMode, schedule: payload.schedule },
        after: null,
        status: 'failed',
        errorMessage
      }).catch(() => {})

      return {
        ok: false,
        message: `Lưu cấu hình thất bại: ${errorMessage}`
      }
    }
  }

  async syncTime(adminId: number): Promise<MutationResult> {
    try {
      const output = await runMachineConfigHelper(
        'sync-time',
        buildHelperConnectionArgs({
          deviceIp: this.deviceIp,
          devicePort: this.devicePort,
          devicePassword: this.getDevicePassword()
        })
      )

      const result = parseHelperJson<MutationResult>(output)
      
      await this.writeAuditLog({
        adminId,
        action: 'sync-time',
        before: { stateMode: -1, schedule: [] },
        after: null,
        status: result.ok ? 'success' : 'failed',
        errorMessage: result.ok ? null : result.message
      }).catch(() => {})

      return result
    } catch (error) {
      const errorMessage = extractHelperErrorMessage(error)

      await this.writeAuditLog({
        adminId,
        action: 'sync-time',
        before: { stateMode: -1, schedule: [] },
        after: null,
        status: 'failed',
        errorMessage
      }).catch(() => {})

      return {
        ok: false,
        message: `Đồng bộ giờ thất bại: ${errorMessage}`
      }
    }
  }

  private getDevicePassword(): number {
    if (typeof this.devicePassword === 'number' && Number.isFinite(this.devicePassword)) {
      return this.devicePassword
    }

    throw new Error('Missing required environment variable: ZK_DEVICE_PASSWORD')
  }

  private async writeAuditLog(args: {
    adminId: number
    action: string
    before: DeviceConfig
    after: DeviceConfig | null
    status: string
    errorMessage: string | null
  }): Promise<void> {
    const pool = await getPool('app')
    const request = pool.request()
    request.input('adminId', args.adminId)
    request.input('deviceIp', this.deviceIp)
    request.input('action', args.action)
    request.input('beforeJson', JSON.stringify(args.before))
    request.input('afterJson', args.after ? JSON.stringify(args.after) : null)
    request.input('status', args.status)
    request.input('errorMessage', args.errorMessage)
    request.input('now', formatSqlDateTime(new Date()))

    await request.query(`
      INSERT INTO dbo.device_config_audit_logs (
        admin_id,
        device_ip,
        action,
        before_json,
        after_json,
        status,
        error_message,
        created_at
      )
      VALUES (
        @adminId,
        @deviceIp,
        @action,
        @beforeJson,
        @afterJson,
        @status,
        @errorMessage,
        CONVERT(datetime2, @now, 120)
      )
    `)
  }
}

export const __internal = {
  resolveMachineConfigHelperPath,
  buildHelperConnectionArgs,
  extractHelperErrorMessage,
  helperTimeoutMs,
  machineConfigDiagnosticFallback
}
