import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('session store resilience', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doUnmock('../electron-store')
    vi.doUnmock('../session-key-store')
  })

  it('creates the encrypted session store with clearInvalidConfig enabled', async () => {
    const fakeStore = {
      get: vi.fn(() => undefined),
      set: vi.fn(),
      delete: vi.fn()
    }
    const createElectronStore = vi.fn((options?: { clearInvalidConfig?: boolean }) => {
      if (!options?.clearInvalidConfig) {
        throw new SyntaxError('Unexpected token R')
      }

      return fakeStore
    })

    vi.doMock('../electron-store', () => ({
      createElectronStore,
      resolveStoreConstructor: (value: unknown) => value
    }))
    vi.doMock('../session-key-store', () => ({
      getOrCreateSessionEncryptionKey: () => 'a'.repeat(64)
    }))

    const { SessionStore } = await import('../session-store')

    expect(() => new SessionStore()).not.toThrow()
    expect(createElectronStore).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ccpro-session',
        clearInvalidConfig: true
      })
    )
  })

  it('creates the session key store with clearInvalidConfig enabled', async () => {
    const fakeStore = {
      get: vi.fn(() => undefined),
      set: vi.fn()
    }
    const createElectronStore = vi.fn((options?: { clearInvalidConfig?: boolean }) => {
      if (!options?.clearInvalidConfig) {
        throw new SyntaxError('Unexpected token R')
      }

      return fakeStore
    })

    vi.doMock('../electron-store', () => ({
      createElectronStore
    }))

    const { getOrCreateSessionEncryptionKey } = await import('../session-key-store')

    expect(() => getOrCreateSessionEncryptionKey()).not.toThrow()
    expect(createElectronStore).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ccpro-security',
        clearInvalidConfig: true
      })
    )
  })
})
