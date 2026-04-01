export interface RegisterIpcHandlersOptions {
  ensureAppReady(): Promise<void>
}

export interface StartupDependencies {
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

export const startApplication = async ({
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

  log('ipc:register:start')
  registerIpcHandlers({ ensureAppReady })
  log('ipc:register:done')

  log('createWindow:bootstrap')
  createWindow()

  log('db:init:start')
  appReady = initializeAppDatabase()
    .then(() => {
      log('db:init:done')
    })
    .catch((error) => {
      startupError = error instanceof Error ? error : new Error(String(error))
      log(`db:init:error:${toErrorMessage(error)}`)
    })

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
