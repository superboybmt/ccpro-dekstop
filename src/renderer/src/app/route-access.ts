export const resolveProtectedRoute = (args: {
  isAuthenticated: boolean
  mustChangePassword: boolean
  pathname: string
}): string | null => {
  if (!args.isAuthenticated) {
    return '/login'
  }

  if (args.mustChangePassword && args.pathname !== '/settings') {
    return '/settings?forcePasswordChange=1'
  }

  return null
}
