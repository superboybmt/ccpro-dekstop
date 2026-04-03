import { startApplication, type RegisterIpcHandlersOptions } from '../startup'

describe('startApplication config bootstrap', () => {
  it('prepares runtime config before registering handlers and initializing the database', async () => {
    const events: string[] = []

    await startApplication({
      prepareRuntimeConfig: vi.fn(async () => {
        events.push('prepare')
      }),
      initializeAppDatabase: vi.fn(async () => {
        events.push('db:init')
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

    expect(events).toEqual(['prepare', 'ipc', 'window', 'db:init', 'tray'])
  })

  it('keeps the app alive and stores the bootstrap failure for the readiness gate', async () => {
    let options!: RegisterIpcHandlersOptions
    const initializeAppDatabase = vi.fn(async () => undefined)

    await startApplication({
      prepareRuntimeConfig: vi.fn(async () => {
        throw new Error('Missing required environment variable: WISEEYE_SQL_PASSWORD')
      }),
      initializeAppDatabase,
      registerIpcHandlers: vi.fn((nextOptions) => {
        options = nextOptions
      }),
      createWindow: vi.fn(),
      createTray: vi.fn(),
      onActivate: vi.fn(),
      getWindowCount: vi.fn(() => 1),
      log: vi.fn()
    })

    await expect(options.ensureAppReady()).rejects.toThrow(
      'Missing required environment variable: WISEEYE_SQL_PASSWORD'
    )
    expect(initializeAppDatabase).not.toHaveBeenCalled()
  })
})
