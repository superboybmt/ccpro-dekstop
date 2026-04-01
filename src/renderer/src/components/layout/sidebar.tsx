import { Bell, Gauge, History, LogOut, Settings } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Avatar } from '@renderer/components/ui/avatar'
import { cn } from '@renderer/lib/utils'
import { useAuth } from '@renderer/providers/auth-provider'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Trang chủ', icon: Gauge },
  { to: '/history', label: 'Lịch sử', icon: History },
  { to: '/notifications', label: 'Thông báo', icon: Bell },
  { to: '/settings', label: 'Cài đặt', icon: Settings }
] as const

export const Sidebar = ({
  onLogout
}: {
  onLogout(): Promise<void>
}): JSX.Element => {
  const { mustChangePassword, user } = useAuth()

  return (
    <aside className="sidebar">
      <div className="sidebar__profile">
        <Avatar initials={user?.avatarInitials ?? 'NV'} size="lg" />
        <div>
          <p className="sidebar__name">{user?.fullName ?? 'Nhân viên'}</p>
          <p className="sidebar__code">{user?.employeeCode ?? '--'}</p>
        </div>
      </div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'sidebar__link',
                  isActive && 'sidebar__link--active',
                  mustChangePassword && item.to !== '/settings' && 'sidebar__link--disabled'
                )
              }
            >
              <Icon size={18} />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <button className="sidebar__logout" onClick={() => void onLogout()}>
        <LogOut size={16} />
        <span>Đăng xuất</span>
      </button>
    </aside>
  )
}
