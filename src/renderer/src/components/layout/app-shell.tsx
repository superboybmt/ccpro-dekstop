import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { DeviceSyncStatus } from '@shared/api'
import { Sidebar } from './sidebar'
import { TopHeader } from './top-header'
import { useAuth } from '@renderer/providers/auth-provider'

const EMPTY_SYNC_STATUS: DeviceSyncStatus = {
  status: 'idle',
  deviceIp: '10.60.1.5',
  lastSyncAt: null,
  lastRunStartedAt: null,
  lastRunFinishedAt: null,
  lastImportedCount: 0,
  lastSkippedCount: 0,
  lastError: null
}

export const AppShell = (): JSX.Element => {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [syncStatus, setSyncStatus] = useState<DeviceSyncStatus>(EMPTY_SYNC_STATUS)
  const [retryingSync, setRetryingSync] = useState(false)

  const loadShellState = async (): Promise<void> => {
    const [notificationsResult, syncResult] = await Promise.allSettled([
      window.ccpro.notifications.list(),
      window.ccpro.deviceSync.getStatus()
    ])

    if (notificationsResult.status === 'fulfilled') {
      setUnreadCount(notificationsResult.value.filter((item) => !item.isRead).length)
    } else {
      setUnreadCount(0)
    }

    if (syncResult.status === 'fulfilled') {
      setSyncStatus(syncResult.value)
    } else {
      setSyncStatus((current) => ({
        ...current,
        status: 'error',
        lastError: 'Không lấy được trạng thái đồng bộ'
      }))
    }
  }

  useEffect(() => {
    if (!user) return

    void loadShellState()
    const timer = window.setInterval(() => {
      void loadShellState()
    }, 15_000)

    return () => window.clearInterval(timer)
  }, [location.pathname, user])

  const handleRetrySync = async (): Promise<void> => {
    setRetryingSync(true)
    try {
      const nextStatus = await window.ccpro.deviceSync.retry()
      setSyncStatus(nextStatus)

      if (nextStatus.status === 'ok') {
        window.location.reload()
      }
    } catch {
      await loadShellState()
    } finally {
      setRetryingSync(false)
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        onLogout={async () => {
          await logout()
          navigate('/login', { replace: true })
        }}
      />

      <main className="app-shell__content">
        <TopHeader
          unreadCount={unreadCount}
          syncStatus={syncStatus}
          onRetrySync={() => void handleRetrySync()}
          retryingSync={retryingSync}
        />
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
