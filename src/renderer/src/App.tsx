import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/layout/app-shell'
import { LoginPage } from './pages/login-page'
import { DashboardPage } from './pages/dashboard-page'
import { HistoryPage } from './pages/history-page'
import { NotificationsPage } from './pages/notifications-page'
import { SettingsPage } from './pages/settings-page'
import { AdminLoginPage } from './pages/admin-login-page'
import { AdminDeviceConfigPage } from './pages/admin-device-config-page'
import { AdminUsersPage } from './pages/admin-users-page'
import { AdminAccountPage } from './pages/admin-account-page'
import { AuthProvider, useAuth } from './providers/auth-provider'
import { resolveProtectedRoute } from './app/route-access'
import { UpdateNotifier } from './components/UpdateNotifier'

const LoadingScreen = (): JSX.Element => (
  <div className="loading-screen">
    <div className="loading-screen__card">
      <div className="loading-screen__dot" />
      <p>Đang tải phiên làm việc...</p>
    </div>
  </div>
)

const ProtectedLayout = (): JSX.Element => {
  const location = useLocation()
  const { authenticated, mustChangePassword, ready } = useAuth()

  if (!ready) return <LoadingScreen />

  const redirect = resolveProtectedRoute({
    isAuthenticated: authenticated,
    mustChangePassword,
    pathname: location.pathname
  })

  if (redirect) {
    return <Navigate to={redirect} replace />
  }

  return <AppShell />
}

const GuestRoute = ({ children }: { children: JSX.Element }): JSX.Element => {
  const { authenticated, mustChangePassword, ready } = useAuth()

  if (!ready) return <LoadingScreen />

  if (authenticated) {
    return <Navigate to={mustChangePassword ? '/settings?forcePasswordChange=1' : '/dashboard'} replace />
  }

  return children
}

const AppRoutes = (): JSX.Element => (
  <Routes>
    <Route
      path="/login"
      element={
        <GuestRoute>
          <LoginPage />
        </GuestRoute>
      }
    />
    <Route element={<ProtectedLayout />}>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Route>
    <Route path="/admin/login" element={<AdminLoginPage />} />
    <Route path="/admin/account" element={<AdminAccountPage />} />
    <Route path="/admin/device-config" element={<AdminDeviceConfigPage />} />
    <Route path="/admin/users" element={<AdminUsersPage />} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
)

export const App = (): JSX.Element => (
  <AuthProvider>
    <HashRouter>
      <AppRoutes />
      <UpdateNotifier />
    </HashRouter>
  </AuthProvider>
)
