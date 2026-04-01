import { describe, expect, it } from 'vitest'
import { resolveStoreConstructor } from '../session-store'

describe('resolveStoreConstructor', () => {
  it('uses the default export when a CommonJS require returns a module namespace', () => {
    class FakeStore {}

    expect(resolveStoreConstructor({ default: FakeStore })).toBe(FakeStore)
  })

  it('keeps direct constructor exports working', () => {
    class FakeStore {}

    expect(resolveStoreConstructor(FakeStore)).toBe(FakeStore)
  })

  it('throws when the module does not expose a constructor', () => {
    expect(() => resolveStoreConstructor({ default: {} })).toThrow('constructor')
  })
})
