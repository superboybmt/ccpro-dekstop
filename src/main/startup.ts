import type { StartupStatus } from '@shared/api'

export interface RegisterIpcHandlersOptions {
  ensureAppReady(): Promise<void>
  getStartupStatus(): StartupStatus
}

export interface StartupDependencies {
  prepareRuntimeConfig?(): Promise<void>
  initializeAppDatabase(): Promise<void>
  registerIpcHandlers(options: RegisterIpcHandlersOptions): void
  createWindow(): void
  createTray(): void
  onActivate(handler: () => void): void
  getWindowCount(): number
  log(message: string): void
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }

  return String(error)
}

const toStartupStatus = (startupError: Error | null): StartupStatus => {
  if (!startupError) {
    return {
      status: 'ready',
      category: 'unknown',
      message: null
    }
  }

  const normalized = startupError.message.toLowerCase()
  if (normalized.includes('missing required environment variable')) {
    return {
      status: 'error',
      category: 'missing-config',
      message: startupError.message
    }
  }

  if (
    normalized.includes('failed to connect') ||
    normalized.includes('econnrefused') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('sql') ||
    normalized.includes('login failed') ||
    normalized.includes('ehostunreach')
  ) {
    return {
      status: 'error',
      category: 'sql-connectivity',
      message: startupError.message
    }
  }

  return {
    status: 'error',
    category: 'unknown',
    message: startupError.message
  }
}

export const startApplication = async ({
  prepareRuntimeConfig,
  initializeAppDatabase,
  registerIpcHandlers,
  createWindow,
  createTray,
  onActivate,
  getWindowCount,
  log
}: StartupDependencies): Promise<void> => {
  let startupError: Error | null = null
  let appReady = Promise.resolve()

  const ensureAppReady = async (): Promise<void> => {
    await appReady

    if (startupError) {
      throw startupError
    }
  }

  if (prepareRuntimeConfig) {
    log('config:prepare:start')
    try {
      await prepareRuntimeConfig()
      log('config:prepare:done')
    } catch (error) {
      startupError = error instanceof Error ? error : new Error(String(error))
      log(`config:prepare:error:${toErrorMessage(error)}`)
    }
  }

  log('ipc:register:start')
  registerIpcHandlers({
    ensureAppReady,
    getStartupStatus: () => toStartupStatus(startupError)
  })
  log('ipc:register:done')

  log('createWindow:bootstrap')
  createWindow()

  if (!startupError) {
    log('db:init:start')
    appReady = initializeAppDatabase()
      .then(() => {
        log('db:init:done')
      })
      .catch((error) => {
        startupError = error instanceof Error ? error : new Error(String(error))
        log(`db:init:error:${toErrorMessage(error)}`)
      })
  }

  try {
    log('createTray:start')
    createTray()
    log('createTray:done')
  } catch (error) {
    log(`createTray:skipped:${toErrorMessage(error)}`)
  }

  onActivate(() => {
    if (getWindowCount() === 0) {
      log('app:activate:createWindow')
      createWindow()
    }
  })
}
