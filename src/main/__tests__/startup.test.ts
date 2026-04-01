import { startApplication, type RegisterIpcHandlersOptions } from '../startup'

describe('startApplication', () => {
  it('creates the main window without waiting for database initialization', async () => {
    const events: string[] = []
    let resolveDatabase!: () => void

    const databaseReady = new Promise<void>((resolve) => {
      resolveDatabase = resolve
    })

    await startApplication({
      initializeAppDatabase: vi.fn(() => {
        events.push('db:init')
        return databaseReady
      }),
      registerIpcHandlers: vi.fn(() => {
        events.push('ipc')
      }),
      createWindow: vi.fn(() => {
        events.push('window')
      }),
      createTray: vi.fn(() => {
        events.push('tray')
      }),
      onActivate: vi.fn(),
      getWindowCount: vi.fn(() => 1),
      log: vi.fn()
    })

    expect(events).toEqual(['ipc', 'window', 'db:init', 'tray'])

    resolveDatabase()
    await databaseReady
  })

  it('gives IPC handlers a readiness gate for deferred database initialization', async () => {
    let resolveDatabase!: () => void
    let options!: RegisterIpcHandlersOptions

    const databaseReady = new Promise<void>((resolve) => {
      resolveDatabase = resolve
    })

    await startApplication({
      initializeAppDatabase: vi.fn(() => databaseReady),
      registerIpcHandlers: vi.fn((nextOptions) => {
        options = nextOptions
      }),
      createWindow: vi.fn(),
      createTray: vi.fn(),
      onActivate: vi.fn(),
      getWindowCount: vi.fn(() => 1),
      log: vi.fn()
    })

    let resolved = false
    const gate = options.ensureAppReady().then(() => {
      resolved = true
    })

    await Promise.resolve()
    expect(resolved).toBe(false)

    resolveDatabase()
    await gate
    expect(resolved).toBe(true)
  })

  it('keeps startup alive when tray initialization fails', async () => {
    const createWindow = vi.fn()

    await startApplication({
      initializeAppDatabase: vi.fn(async () => undefined),
      registerIpcHandlers: vi.fn(),
      createWindow,
      createTray: vi.fn(() => {
        throw new Error('tray icon is missing')
      }),
      onActivate: vi.fn(),
      getWindowCount: vi.fn(() => 1),
      log: vi.fn()
    })

    expect(createWindow).toHaveBeenCalledTimes(1)
  })
})
