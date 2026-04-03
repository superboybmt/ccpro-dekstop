import { describe, expect, it } from 'vitest'
import { assertSafeDatabaseName } from '../init'

describe('assertSafeDatabaseName', () => {
  it('accepts alphanumeric database names with underscores', () => {
    expect(assertSafeDatabaseName('CCPro_2026')).toBe('CCPro_2026')
  })

  it('rejects database names that contain SQL control characters', () => {
    expect(() => assertSafeDatabaseName("CCPro']; DROP DATABASE master;--")).toThrow(
      'Invalid database name'
    )
  })
})
