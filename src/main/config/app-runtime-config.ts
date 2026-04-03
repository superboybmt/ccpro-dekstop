import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export type AppRuntimeConfig = {
  sql: {
    user: string
    password: string
    server: string
    port: number
    wiseEyeDatabase: string
    appDatabase: string
    machineNo: number
  }
  deviceSync: {
    ip: string
    port: number
    password?: number
    bootstrapDays: number
    pollIntervalMs: number
    runTimeoutMs: number
  }
  updateIntegrity: {
    mode: 'audit' | 'enforce'
    publicKey: string | null
  }
}

export type PartialAppRuntimeConfig = {
  sql?: Partial<AppRuntimeConfig['sql']>
  deviceSync?: Partial<AppRuntimeConfig['deviceSync']>
  updateIntegrity?: Partial<AppRuntimeConfig['updateIntegrity']>
}

export const DEFAULT_APP_RUNTIME_CONFIG: AppRuntimeConfig = {
  sql: {
    user: 'sa',
    password: '',
    server: '10.60.1.4',
    port: 1433,
    wiseEyeDatabase: 'WiseEye',
    appDatabase: 'CCPro',
    machineNo: 1
  },
  deviceSync: {
    ip: '10.60.1.5',
    port: 4370,
    password: undefined,
    bootstrapDays: 7,
    pollIntervalMs: 60_000,
    runTimeoutMs: 180_000
  },
  updateIntegrity: {
    mode: 'audit',
    publicKey: null
  }
}

const stripWrappingQuotes = (value: string): string => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

const readNumber = (value: string | number | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const readOptionalNumber = (value: string | number | undefined): number | undefined => {
  if (value == null || String(value).trim() === '') {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const readOptionalString = (value: string | undefined): string | null => {
  if (value == null) {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

const collectEnvFileCandidates = (): string[] => {
  const candidates: string[] = []
  const seen = new Set<string>()

  const pushCandidate = (filePath: string): void => {
    if (seen.has(filePath)) {
      return
    }

    seen.add(filePath)
    candidates.push(filePath)
  }

  const addDirectoryCandidates = (directory: string | undefined, parentDepth: number): void => {
    if (!directory) {
      return
    }

    let current = resolve(directory)
    for (let depth = 0; depth <= parentDepth; depth += 1) {
      pushCandidate(join(current, '.env'))

      const parent = dirname(current)
      if (parent === current) {
        break
      }

      current = parent
    }
  }

  addDirectoryCandidates(process.env.PORTABLE_EXECUTABLE_DIR, 1)
  addDirectoryCandidates(process.execPath ? dirname(process.execPath) : undefined, 2)
  addDirectoryCandidates(process.cwd(), 2)

  return candidates
}

export const resolveLocalAppConfigPath = (): string =>
  join(process.env.APPDATA ?? process.cwd(), 'ccpro-desktop', 'config.json')

export const readLocalAppRuntimeConfig = (): PartialAppRuntimeConfig | null => {
  const configPath = resolveLocalAppConfigPath()
  if (!existsSync(configPath)) {
    return null
  }

  return JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '')) as PartialAppRuntimeConfig
}

const loadEnvFileValues = (): Record<string, string> => {
  const envFilePath = collectEnvFileCandidates().find((candidate) => existsSync(candidate))
  if (!envFilePath) {
    return {}
  }

  const content = readFileSync(envFilePath, 'utf8').replace(/^\uFEFF/, '')
  const values: Record<string, string> = {}

  for (const line of content.split(/\r?\n/u)) {
    const trimmedLine = line.trim()
    if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    if (key.length === 0) {
      continue
    }

    const rawValue = trimmedLine.slice(separatorIndex + 1).trim()
    values[key] = stripWrappingQuotes(rawValue)
  }

  return values
}

const readEnvValue = (envFileValues: Record<string, string>, key: string): string | undefined => {
  const processValue = process.env[key]
  if (processValue !== undefined) {
    return processValue
  }

  return envFileValues[key]
}

export const loadAppRuntimeConfig = (): AppRuntimeConfig => {
  const localConfig = readLocalAppRuntimeConfig()
  const envFileValues = localConfig ? {} : loadEnvFileValues()

  return {
    sql: {
      user: localConfig?.sql?.user ?? readEnvValue(envFileValues, 'WISEEYE_SQL_USER') ?? DEFAULT_APP_RUNTIME_CONFIG.sql.user,
      password:
        localConfig?.sql?.password ?? readEnvValue(envFileValues, 'WISEEYE_SQL_PASSWORD') ?? DEFAULT_APP_RUNTIME_CONFIG.sql.password,
      server:
        localConfig?.sql?.server ?? readEnvValue(envFileValues, 'WISEEYE_SQL_SERVER') ?? DEFAULT_APP_RUNTIME_CONFIG.sql.server,
      port: readNumber(localConfig?.sql?.port ?? readEnvValue(envFileValues, 'WISEEYE_SQL_PORT'), DEFAULT_APP_RUNTIME_CONFIG.sql.port),
      wiseEyeDatabase:
        localConfig?.sql?.wiseEyeDatabase ??
        readEnvValue(envFileValues, 'WISEEYE_SQL_DATABASE') ??
        DEFAULT_APP_RUNTIME_CONFIG.sql.wiseEyeDatabase,
      appDatabase:
        localConfig?.sql?.appDatabase ??
        readEnvValue(envFileValues, 'CCPRO_APP_DATABASE') ??
        DEFAULT_APP_RUNTIME_CONFIG.sql.appDatabase,
      machineNo: readNumber(
        localConfig?.sql?.machineNo ?? readEnvValue(envFileValues, 'WISEEYE_MACHINE_NO'),
        DEFAULT_APP_RUNTIME_CONFIG.sql.machineNo
      )
    },
    deviceSync: {
      ip: localConfig?.deviceSync?.ip ?? readEnvValue(envFileValues, 'ZK_DEVICE_IP') ?? DEFAULT_APP_RUNTIME_CONFIG.deviceSync.ip,
      port: readNumber(
        localConfig?.deviceSync?.port ?? readEnvValue(envFileValues, 'ZK_DEVICE_PORT'),
        DEFAULT_APP_RUNTIME_CONFIG.deviceSync.port
      ),
      password: readOptionalNumber(localConfig?.deviceSync?.password ?? readEnvValue(envFileValues, 'ZK_DEVICE_PASSWORD')),
      bootstrapDays: readNumber(
        localConfig?.deviceSync?.bootstrapDays ?? readEnvValue(envFileValues, 'ZK_BOOTSTRAP_DAYS'),
        DEFAULT_APP_RUNTIME_CONFIG.deviceSync.bootstrapDays
      ),
      pollIntervalMs: readNumber(
        localConfig?.deviceSync?.pollIntervalMs ?? readEnvValue(envFileValues, 'ZK_SYNC_INTERVAL_MS'),
        DEFAULT_APP_RUNTIME_CONFIG.deviceSync.pollIntervalMs
      ),
      runTimeoutMs: readNumber(
        localConfig?.deviceSync?.runTimeoutMs ?? readEnvValue(envFileValues, 'ZK_SYNC_TIMEOUT_MS'),
        DEFAULT_APP_RUNTIME_CONFIG.deviceSync.runTimeoutMs
      )
    },
    updateIntegrity: {
      mode:
        (localConfig?.updateIntegrity?.mode ??
          readEnvValue(envFileValues, 'CCPRO_UPDATE_INTEGRITY_MODE') ??
          DEFAULT_APP_RUNTIME_CONFIG.updateIntegrity.mode) === 'enforce'
          ? 'enforce'
          : 'audit',
      publicKey:
        localConfig?.updateIntegrity?.publicKey ?? readOptionalString(readEnvValue(envFileValues, 'CCPRO_UPDATE_PUBLIC_KEY'))
    }
  }
}

export const readEnvAppRuntimeConfig = (): PartialAppRuntimeConfig | null => {
  const envFileValues = loadEnvFileValues()
  if (Object.keys(envFileValues).length === 0) {
    return null
  }

  return {
    sql: {
      user: readEnvValue(envFileValues, 'WISEEYE_SQL_USER'),
      password: readEnvValue(envFileValues, 'WISEEYE_SQL_PASSWORD'),
      server: readEnvValue(envFileValues, 'WISEEYE_SQL_SERVER'),
      port: readNumber(readEnvValue(envFileValues, 'WISEEYE_SQL_PORT'), DEFAULT_APP_RUNTIME_CONFIG.sql.port),
      wiseEyeDatabase: readEnvValue(envFileValues, 'WISEEYE_SQL_DATABASE'),
      appDatabase: readEnvValue(envFileValues, 'CCPRO_APP_DATABASE'),
      machineNo: readNumber(readEnvValue(envFileValues, 'WISEEYE_MACHINE_NO'), DEFAULT_APP_RUNTIME_CONFIG.sql.machineNo)
    },
    deviceSync: {
      ip: readEnvValue(envFileValues, 'ZK_DEVICE_IP'),
      port: readNumber(readEnvValue(envFileValues, 'ZK_DEVICE_PORT'), DEFAULT_APP_RUNTIME_CONFIG.deviceSync.port),
      password: readOptionalNumber(readEnvValue(envFileValues, 'ZK_DEVICE_PASSWORD')),
      bootstrapDays: readNumber(
        readEnvValue(envFileValues, 'ZK_BOOTSTRAP_DAYS'),
        DEFAULT_APP_RUNTIME_CONFIG.deviceSync.bootstrapDays
      ),
      pollIntervalMs: readNumber(
        readEnvValue(envFileValues, 'ZK_SYNC_INTERVAL_MS'),
        DEFAULT_APP_RUNTIME_CONFIG.deviceSync.pollIntervalMs
      ),
      runTimeoutMs: readNumber(
        readEnvValue(envFileValues, 'ZK_SYNC_TIMEOUT_MS'),
        DEFAULT_APP_RUNTIME_CONFIG.deviceSync.runTimeoutMs
      )
    },
    updateIntegrity: {
      mode: readEnvValue(envFileValues, 'CCPRO_UPDATE_INTEGRITY_MODE') === 'enforce' ? 'enforce' : 'audit',
      publicKey: readOptionalString(readEnvValue(envFileValues, 'CCPRO_UPDATE_PUBLIC_KEY'))
    }
  }
}

export const writeLocalAppRuntimeConfig = (config: PartialAppRuntimeConfig): string => {
  const configPath = resolveLocalAppConfigPath()
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return configPath
}

export const resolvePackagedAppConfigSeedPath = (): string => {
  const override = process.env.CCPRO_APP_CONFIG_SEED_PATH?.trim()
  if (override) {
    return override
  }

  return join(process.resourcesPath, 'bootstrap', 'app-config.seed.json')
}

export const __internal = {
  collectEnvFileCandidates,
  loadEnvFileValues,
  readLocalAppRuntimeConfig
}
