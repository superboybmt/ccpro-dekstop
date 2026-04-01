import type { config as SqlConfig } from 'mssql'

const readNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const appConfig = {
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  sessionEncryptionKey: process.env.CCPRO_SESSION_KEY ?? 'ccpro-desktop-session-key',
  sql: {
    user: process.env.WISEEYE_SQL_USER ?? 'sa',
    password: process.env.WISEEYE_SQL_PASSWORD ?? 'Pnj@12345',
    server: process.env.WISEEYE_SQL_SERVER ?? '10.60.1.4',
    port: readNumber(process.env.WISEEYE_SQL_PORT, 1433),
    wiseEyeDatabase: process.env.WISEEYE_SQL_DATABASE ?? 'WiseEye',
    appDatabase: process.env.CCPRO_APP_DATABASE ?? 'CCPro',
    machineNo: readNumber(process.env.WISEEYE_MACHINE_NO, 1)
  },
  deviceSync: {
    ip: process.env.ZK_DEVICE_IP ?? '10.60.1.5',
    port: readNumber(process.env.ZK_DEVICE_PORT, 4370),
    password: readNumber(process.env.ZK_DEVICE_PASSWORD, 938948),
    bootstrapDays: readNumber(process.env.ZK_BOOTSTRAP_DAYS, 7),
    pollIntervalMs: readNumber(process.env.ZK_SYNC_INTERVAL_MS, 60_000),
    runTimeoutMs: readNumber(process.env.ZK_SYNC_TIMEOUT_MS, 180_000)
  },
  notifications: {
    lookbackDays: 14,
    missingCheckoutGraceMinutes: 30
  }
} as const

export const getSqlConfig = (database?: string): SqlConfig => ({
  user: appConfig.sql.user,
  password: appConfig.sql.password,
  server: appConfig.sql.server,
  port: appConfig.sql.port,
  database,
  options: {
    encrypt: false,
    trustServerCertificate: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  connectionTimeout: 10000,
  requestTimeout: 15000
})
