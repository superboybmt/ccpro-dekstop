import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'

describe('getSqlConfig', () => {
  const originalPassword = process.env.WISEEYE_SQL_PASSWORD
  const originalPortableExecutableDir = process.env.PORTABLE_EXECUTABLE_DIR
  const originalAppData = process.env.APPDATA
  const originalSeedPath = process.env.CCPRO_APP_CONFIG_SEED_PATH
  const cwdSpy = vi.spyOn(process, 'cwd')

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doUnmock('node:fs')
    cwdSpy.mockReturnValue('E:\\ccpro')
    process.env.APPDATA = 'C:\\Users\\tester\\AppData\\Roaming'
  })

  afterEach(() => {
    vi.resetModules()
    cwdSpy.mockReset()
    if (originalPassword === undefined) {
      delete process.env.WISEEYE_SQL_PASSWORD
    } else {
      process.env.WISEEYE_SQL_PASSWORD = originalPassword
    }

    if (originalAppData === undefined) {
      delete process.env.APPDATA
    } else {
      process.env.APPDATA = originalAppData
    }

    if (originalPortableExecutableDir === undefined) {
      delete process.env.PORTABLE_EXECUTABLE_DIR
    } else {
      process.env.PORTABLE_EXECUTABLE_DIR = originalPortableExecutableDir
    }

    if (originalSeedPath === undefined) {
      delete process.env.CCPRO_APP_CONFIG_SEED_PATH
    } else {
      process.env.CCPRO_APP_CONFIG_SEED_PATH = originalSeedPath
    }
  })

  it('throws a clear error when the SQL password is missing', async () => {
    delete process.env.WISEEYE_SQL_PASSWORD
    vi.doMock('node:fs', () => {
      const fsMock = {
        existsSync: vi.fn(() => false),
        readFileSync: vi.fn()
      }

      return {
        ...fsMock,
        default: fsMock
      }
    })

    const { getSqlConfig } = await import('../app-config')

    expect(() => getSqlConfig('CCPro')).toThrow(
      'Missing required environment variable: WISEEYE_SQL_PASSWORD'
    )
  })

  it('loads the SQL password from the root .env file when process.env is empty', async () => {
    delete process.env.WISEEYE_SQL_PASSWORD
    const localConfigPath = join(process.env.APPDATA!, 'ccpro-desktop', 'config.json')
    vi.doMock('node:fs', () => {
      const fsMock = {
        existsSync: vi.fn((filePath: string) => filePath !== localConfigPath),
        readFileSync: vi.fn((filePath: string) => {
          if (filePath === localConfigPath) {
            throw new Error(`Unexpected readFileSync for ${filePath}`)
          }

          return 'WISEEYE_SQL_PASSWORD=from-dot-env\n'
        })
      }

      return {
        ...fsMock,
        default: fsMock
      }
    })

    const { getSqlConfig } = await import('../app-config')

    expect(getSqlConfig('CCPro').password).toBe('from-dot-env')
  })

  it('loads the SQL password from a packaged app .env path when cwd does not contain one', async () => {
    delete process.env.WISEEYE_SQL_PASSWORD
    process.env.PORTABLE_EXECUTABLE_DIR = 'E:\\ccpro\\release\\CCPro-Portable'
    cwdSpy.mockReturnValue('E:\\ccpro\\release\\win-unpacked')

    vi.doMock('node:fs', () => {
      const portableEnvPath = join(process.env.PORTABLE_EXECUTABLE_DIR!, '.env')
      const fsMock = {
        existsSync: vi.fn((filePath: string) => filePath === portableEnvPath),
        readFileSync: vi.fn((filePath: string) => {
          if (filePath === portableEnvPath) {
            return 'WISEEYE_SQL_PASSWORD=from-packaged-env\n'
          }

          throw new Error(`Unexpected readFileSync for ${filePath}`)
        })
      }

      return {
        ...fsMock,
        default: fsMock
      }
    })

    const { getSqlConfig } = await import('../app-config')

    expect(getSqlConfig('CCPro').password).toBe('from-packaged-env')
  })

  it('prefers the local app config over .env values when both exist', async () => {
    delete process.env.WISEEYE_SQL_PASSWORD
    const localConfigPath = join(process.env.APPDATA!, 'ccpro-desktop', 'config.json')

    vi.doMock('node:fs', () => {
      const fsMock = {
        existsSync: vi.fn((filePath: string) => filePath === localConfigPath || filePath.endsWith('\\.env')),
        readFileSync: vi.fn((filePath: string) => {
          if (filePath === localConfigPath) {
            return JSON.stringify({
              sql: {
                password: 'from-local-config',
                server: '10.10.10.10'
              }
            })
          }

          return 'WISEEYE_SQL_PASSWORD=from-dot-env\nWISEEYE_SQL_SERVER=10.60.1.4\n'
        })
      }

      return {
        ...fsMock,
        default: fsMock
      }
    })

    const { appConfig, getSqlConfig } = await import('../app-config')

    expect(getSqlConfig('CCPro').password).toBe('from-local-config')
    expect(appConfig.sql.server).toBe('10.10.10.10')
  })

  it('applies non-secret defaults when the local app config omits them', async () => {
    delete process.env.WISEEYE_SQL_PASSWORD
    const localConfigPath = join(process.env.APPDATA!, 'ccpro-desktop', 'config.json')

    vi.doMock('node:fs', () => {
      const fsMock = {
        existsSync: vi.fn((filePath: string) => filePath === localConfigPath),
        readFileSync: vi.fn((filePath: string) => {
          if (filePath === localConfigPath) {
            return JSON.stringify({
              sql: {
                password: 'from-local-config'
              }
            })
          }

          throw new Error(`Unexpected readFileSync for ${filePath}`)
        })
      }

      return {
        ...fsMock,
        default: fsMock
      }
    })

    const { appConfig } = await import('../app-config')

    expect(appConfig.sql.server).toBe('10.60.1.4')
    expect(appConfig.sql.port).toBe(1433)
    expect(appConfig.deviceSync.ip).toBe('10.60.1.5')
  })

  it('prefers a staged AppData seed path override in packaged mode', async () => {
    process.env.CCPRO_APP_CONFIG_SEED_PATH =
      'C:\\Users\\tester\\AppData\\Roaming\\ccpro-desktop\\runtime\\1.0.3\\bootstrap\\app-config.seed.json'

    const { resolvePackagedAppConfigSeedPath } = await import('../app-runtime-config')

    expect(resolvePackagedAppConfigSeedPath()).toBe(process.env.CCPRO_APP_CONFIG_SEED_PATH)
  })
})
