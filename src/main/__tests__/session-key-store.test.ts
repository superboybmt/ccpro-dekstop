import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { getOrCreateSessionEncryptionKey } from '../session-key-store'

describe('getOrCreateSessionEncryptionKey', () => {
  it('returns the persisted key when one already exists', () => {
    const store = {
      get: vi.fn(() => 'a'.repeat(64)),
      set: vi.fn()
    }
    const randomBytes = vi.fn(() => Buffer.alloc(32, 7))

    const key = getOrCreateSessionEncryptionKey({
      createStore: () => store,
      randomBytes
    })

    expect(key).toBe('a'.repeat(64))
    expect(randomBytes).not.toHaveBeenCalled()
    expect(store.set).not.toHaveBeenCalled()
  })

  it('generates and persists a new 32-byte hex key on first launch', () => {
    let storedKey: string | undefined
    const randomBuffer = Buffer.from(Array.from({ length: 32 }, (_, index) => index))

    const key = getOrCreateSessionEncryptionKey({
      createStore: () => ({
        get: vi.fn(() => storedKey),
        set: vi.fn((_field: string, value: string) => {
          storedKey = value
        })
      }),
      randomBytes: vi.fn((size: number) => {
        expect(size).toBe(32)
        return randomBuffer
      })
    })

    expect(key).toBe(randomBuffer.toString('hex'))
    expect(storedKey).toBe(randomBuffer.toString('hex'))
  })
})
