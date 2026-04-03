import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const envPath = join(repoRoot, '.env')
const outputDir = join(repoRoot, 'build', 'bootstrap')
const outputPath = join(outputDir, 'app-config.seed.json')

const stripWrappingQuotes = (value) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

const parseEnvFile = (filePath) => {
  if (!existsSync(filePath)) {
    return {}
  }

  const values = {}
  const content = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')

  for (const line of content.split(/\r?\n/u)) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim()
    values[key] = stripWrappingQuotes(rawValue)
  }

  return values
}

const envFileValues = parseEnvFile(envPath)
const readValue = (key, fallback = undefined) => process.env[key] ?? envFileValues[key] ?? fallback
const readNumber = (key, fallback) => {
  const parsed = Number(readValue(key))
  return Number.isFinite(parsed) ? parsed : fallback
}

const sqlPassword = readValue('WISEEYE_SQL_PASSWORD', '').trim()
if (!sqlPassword) {
  throw new Error('Missing required environment variable for seed generation: WISEEYE_SQL_PASSWORD')
}

const devicePasswordRaw = readValue('ZK_DEVICE_PASSWORD', '').trim()
const devicePassword = devicePasswordRaw ? Number(devicePasswordRaw) : undefined

const seed = {
  sql: {
    user: readValue('WISEEYE_SQL_USER', 'sa'),
    password: sqlPassword,
    server: readValue('WISEEYE_SQL_SERVER', '10.60.1.4'),
    port: readNumber('WISEEYE_SQL_PORT', 1433),
    wiseEyeDatabase: readValue('WISEEYE_SQL_DATABASE', 'WiseEye'),
    appDatabase: readValue('CCPRO_APP_DATABASE', 'CCPro'),
    machineNo: readNumber('WISEEYE_MACHINE_NO', 1)
  },
  deviceSync: {
    ip: readValue('ZK_DEVICE_IP', '10.60.1.5'),
    port: readNumber('ZK_DEVICE_PORT', 4370),
    ...(Number.isFinite(devicePassword) ? { password: devicePassword } : {}),
    bootstrapDays: readNumber('ZK_BOOTSTRAP_DAYS', 7),
    pollIntervalMs: readNumber('ZK_SYNC_INTERVAL_MS', 60_000),
    runTimeoutMs: readNumber('ZK_SYNC_TIMEOUT_MS', 180_000)
  },
  updateIntegrity: {
    mode: readValue('CCPRO_UPDATE_INTEGRITY_MODE', 'audit') === 'enforce' ? 'enforce' : 'audit',
    publicKey: readValue('CCPRO_UPDATE_PUBLIC_KEY', '').trim() || null
  }
}

mkdirSync(outputDir, { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8')
console.log(`Staged app config seed to ${outputPath}`)
