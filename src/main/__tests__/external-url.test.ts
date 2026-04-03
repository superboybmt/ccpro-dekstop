import { describe, expect, it, vi } from 'vitest'
import { denyAndOpenAllowedExternalUrl, isAllowedExternalUrl } from '../external-url'

describe('external URL handling', () => {
  it('accepts only HTTPS URLs', () => {
    expect(isAllowedExternalUrl('https://example.com/download')).toBe(true)
    expect(isAllowedExternalUrl('http://example.com')).toBe(false)
    expect(isAllowedExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('not a url')).toBe(false)
  })

  it('always denies new windows and opens only allowed external URLs', () => {
    const openExternal = vi.fn()

    expect(denyAndOpenAllowedExternalUrl('https://example.com/help', openExternal)).toEqual({
      action: 'deny'
    })
    expect(openExternal).toHaveBeenCalledWith('https://example.com/help')

    openExternal.mockClear()

    expect(denyAndOpenAllowedExternalUrl('file:///C:/Windows/System32/calc.exe', openExternal)).toEqual({
      action: 'deny'
    })
    expect(openExternal).not.toHaveBeenCalled()
  })
})
