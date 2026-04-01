import { describe, expect, it } from 'vitest'
import { resolveProtectedRoute } from '../route-access'

describe('resolveProtectedRoute', () => {
  it('sends guests back to login', () => {
    expect(
      resolveProtectedRoute({
        isAuthenticated: false,
        mustChangePassword: false,
        pathname: '/dashboard'
      })
    ).toBe('/login')
  })

  it('forces first-login users onto settings', () => {
    expect(
      resolveProtectedRoute({
        isAuthenticated: true,
        mustChangePassword: true,
        pathname: '/history'
      })
    ).toBe('/settings?forcePasswordChange=1')
  })

  it('keeps authenticated users on allowed pages', () => {
    expect(
      resolveProtectedRoute({
        isAuthenticated: true,
        mustChangePassword: false,
        pathname: '/dashboard'
      })
    ).toBeNull()
  })
})
