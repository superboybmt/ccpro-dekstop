import sql, { type ConnectionPool } from 'mssql'
import { appConfig, getSqlConfig } from '../config/app-config'

type PoolName = 'master' | 'wise-eye' | 'app'

const poolPromises = new Map<PoolName, Promise<ConnectionPool>>()
const CONNECTION_STATUS_TTL_MS = 5_000

let connectionStatusCache:
  | {
      status: 'connected' | 'disconnected'
      checkedAt: number
    }
  | null = null
let connectionStatusPromise: Promise<'connected' | 'disconnected'> | null = null

const resolveDatabaseName = (name: PoolName): string | undefined => {
  if (name === 'master') return 'master'
  if (name === 'wise-eye') return appConfig.sql.wiseEyeDatabase
  return appConfig.sql.appDatabase
}

export const getPool = (name: PoolName): Promise<ConnectionPool> => {
  const existing = poolPromises.get(name)
  if (existing) return existing

  const connectionPool = new sql.ConnectionPool(getSqlConfig(resolveDatabaseName(name)))

  // Bắt các event lỗi rớt mạng/đóng kết nối bất ngờ (socketError)
  connectionPool.on('error', (err) => {
    console.error(`[SQL] Connection pool ${name} encountered an error:`, err)
    // Xoá pool khỏi cache để lần gọi tiếp theo nó tự kết nối lại (Auto-heal)
    poolPromises.delete(name)
  })

  const poolPromise = connectionPool
    .connect()
    .then((connectedPool) => connectedPool)
    .catch((error) => {
      poolPromises.delete(name)
      throw error
    })

  poolPromises.set(name, poolPromise)
  return poolPromise
}

export const closePools = async (): Promise<void> => {
  await Promise.allSettled(
    Array.from(poolPromises.values(), async (poolPromise) => {
      const pool = await poolPromise
      if (pool.connected) {
        await pool.close()
      }
    })
  )

  poolPromises.clear()
  connectionStatusCache = null
  connectionStatusPromise = null
}

const probePool = async (name: Extract<PoolName, 'wise-eye' | 'app'>): Promise<void> => {
  const pool = await getPool(name)
  await pool.request().query('SELECT 1 AS ok')
}

export const getConnectionStatus = async (): Promise<'connected' | 'disconnected'> => {
  const now = Date.now()
  if (connectionStatusCache && now - connectionStatusCache.checkedAt < CONNECTION_STATUS_TTL_MS) {
    return connectionStatusCache.status
  }

  if (connectionStatusPromise) {
    return connectionStatusPromise
  }

  connectionStatusPromise = (async () => {
    try {
      await Promise.all([probePool('wise-eye'), probePool('app')])
      connectionStatusCache = {
        status: 'connected',
        checkedAt: Date.now()
      }
    } catch {
      connectionStatusCache = {
        status: 'disconnected',
        checkedAt: Date.now()
      }
    } finally {
      connectionStatusPromise = null
    }

    return connectionStatusCache.status
  })()

  return connectionStatusPromise
}
