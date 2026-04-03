import type { config as SqlConfig } from 'mssql'
import { loadAppRuntimeConfig } from './app-runtime-config'

const requireEnvironmentVariable = (name: string, value: string): string => {
  if (value.length > 0) {
    return value
  }

  throw new Error(`Missing required environment variable: ${name}`)
}

let runtimeConfig = loadAppRuntimeConfig()

export const refreshAppConfig = () => {
  runtimeConfig = loadAppRuntimeConfig()
  return runtimeConfig
}

export const appConfig = {
  get sessionTtlMs() {
    return 30 * 24 * 60 * 60 * 1000
  },
  get sql() {
    return runtimeConfig.sql
  },
  get deviceSync() {
    return runtimeConfig.deviceSync
  },
  notifications: {
    lookbackDays: 14,
    missingCheckoutGraceMinutes: 30
  },
  get updateIntegrity() {
    return runtimeConfig.updateIntegrity
  }
} as const

export const getSqlConfig = (database?: string): SqlConfig => ({
  user: appConfig.sql.user,
  password: requireEnvironmentVariable('WISEEYE_SQL_PASSWORD', appConfig.sql.password),
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
