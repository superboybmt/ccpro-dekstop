import { AlertCircle, Bell, LoaderCircle, RefreshCw, Search, Wifi } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { DeviceSyncStatus } from '@shared/api'
import { getAppHour } from '@shared/app-time'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { useAuth } from '@renderer/providers/auth-provider'

const getGreeting = (): string => {
  const hour = getAppHour(new Date())
  if (hour < 12) return 'Chào buổi sáng'
  if (hour < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

interface TopHeaderProps {
  unreadCount: number
  syncStatus: DeviceSyncStatus
  onRefresh?: () => void
  onRetrySync?: () => void
  retryingSync?: boolean
}

const syncMeta: Record<
  DeviceSyncStatus['status'],
  {
    label: string
    className: string
    Icon: typeof Wifi
  }
> = {
  idle: {
    label: 'Chưa đồng bộ',
    className: 'top-header__sync-pill--idle',
    Icon: Wifi
  },
  syncing: {
    label: 'Đang đồng bộ',
    className: 'top-header__sync-pill--syncing',
    Icon: LoaderCircle
  },
  ok: {
    label: 'Đã đồng bộ',
    className: 'top-header__sync-pill--ok',
    Icon: Wifi
  },
  error: {
    label: 'Lỗi đồng bộ',
    className: 'top-header__sync-pill--error',
    Icon: AlertCircle
  }
}

export const TopHeader = ({
  unreadCount,
  syncStatus,
  onRefresh = () => window.location.reload(),
  onRetrySync = () => undefined,
  retryingSync = false
}: TopHeaderProps): JSX.Element => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const syncState = syncMeta[syncStatus.status]
  const SyncIcon = syncState.Icon

  return (
    <header className="top-header">
      <div>
        <p className="top-header__eyebrow">{getGreeting()}</p>
        <h1 className="top-header__title">{user?.fullName ?? 'Nhân viên'}.</h1>
      </div>

      <div className="top-header__actions">
        <div className={`top-header__sync-pill ${syncState.className}`}>
          <SyncIcon size={14} className={syncStatus.status === 'syncing' ? 'top-header__sync-spin' : undefined} />
          <span>{syncState.label}</span>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="top-header__sync-retry"
          onClick={onRetrySync}
          disabled={retryingSync || syncStatus.status === 'syncing'}
        >
          <RefreshCw size={16} className={retryingSync ? 'top-header__sync-spin' : undefined} />
          Đồng bộ lại
        </Button>

        <Button
          type="button"
          variant="secondary"
          className="top-header__refresh"
          aria-label="Làm mới dữ liệu"
          onClick={onRefresh}
        >
          <RefreshCw size={16} />
          Làm mới
        </Button>

        <div className="top-header__search">
          <Search size={16} />
          <Input placeholder="Tìm kiếm nhanh..." aria-label="Tìm kiếm nhanh" />
        </div>

        <button
          type="button"
          className="top-header__bell"
          onClick={() => navigate('/notifications')}
          style={{ cursor: 'pointer', border: 'none' }}
        >
          <Bell size={18} />
          {unreadCount > 0 ? <span className="top-header__badge">{unreadCount}</span> : null}
        </button>
      </div>
    </header>
  )
}
