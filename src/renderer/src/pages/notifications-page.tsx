import { useEffect, useState } from 'react'
import type { NotificationItem } from '@shared/api'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { toUiErrorMessage } from '@renderer/lib/errors'
import { formatRelativeTime } from '@renderer/lib/format'
import { Bell, CheckCircle2 } from 'lucide-react'

export const NotificationsPage = (): JSX.Element => {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadNotifications = async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const result = await window.ccpro.notifications.list()
      setItems(result)
    } catch (reason) {
      setError(toUiErrorMessage(reason, 'Không tải được thông báo'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadNotifications()
  }, [])

  const unreadCount = items.filter((item) => !item.isRead).length

  return (
    <div className="page-wrapper" style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-document)' }}>
      <div className="page-header" style={{ flexShrink: 0, padding: '16px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={24} style={{ color: 'var(--primary)' }} />
            Thông báo hệ thống
          </h1>
          <p className="muted-line" style={{ marginTop: '4px' }}>
            Theo dõi cảnh báo đi trễ, thiếu chấm ra và các cập nhật quan trọng.
          </p>
        </div>
        <Button 
          variant="secondary" 
          onClick={() => void window.ccpro.notifications.markAllRead().then(loadNotifications)}
          style={{ height: '40px' }}
        >
          <CheckCircle2 size={16} className="mr-2" />
          Đánh dấu đã đọc tất cả
        </Button>
      </div>

      <div className="page-content" style={{ flex: 1, minHeight: 0, padding: '0 16px 16px 16px', display: 'flex', flexDirection: 'column' }}>
        
        {loading ? <p className="inline-message">Đang tải thông báo...</p> : null}
        {error ? <p className="inline-message inline-message--error">{error}</p> : null}
        
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: '12px', flex: 1, minHeight: 0 }}>
          
          {/* Left Column: Notification List */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
            {!loading && items.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <Bell size={48} style={{ color: 'var(--border-default)', marginBottom: '16px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 500, margin: '0 0 8px 0' }}>Không có thông báo mới</h3>
                <p className="muted-line" style={{ margin: 0 }}>Bạn đã đọc tất cả thông báo hiện tại.</p>
              </div>
            ) : (
              <div className="notification-list" style={{ flex: 1, overflowY: 'auto', alignContent: 'start' }}>
                {items.map((item) => (
                  <button
                    key={item.id}
                    className={`notification-card ${item.isRead ? '' : 'notification-card--unread'}`}
                    onClick={() => void window.ccpro.notifications.markRead(item.id).then(loadNotifications)}
                  >
                    {!item.isRead && <div className="notification-card__new-dot" />}
                    <div className="notification-card__body">
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.description}</p>
                      </div>
                      <span className="notification-card__time">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Stats & Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
            <Card title="Phân tích tuần">
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--bg-hover)', marginBottom: '12px' }}>
                <span className="muted-line">Chưa đọc</span>
                <strong style={{ color: unreadCount > 0 ? 'var(--primary)' : 'var(--text-main)' }}>
                  {unreadCount.toString().padStart(2, '0')}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted-line">Tổng thông báo</span>
                <strong>{items.length.toString().padStart(2, '0')}</strong>
              </div>
            </Card>
          </div>

        </div>
      </div>
    </div>
  )
}
