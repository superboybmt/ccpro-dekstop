import { useEffect, useState } from 'react'
import { DownloadCloud, X } from 'lucide-react'
import type { UpdateInfo } from '@shared/api'

export const UpdateNotifier = (): JSX.Element | null => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Start update check
    window.ccpro.app.checkForUpdates().catch(console.error)

    // Listen to update availability
    const unsubscribe = window.ccpro.app.onUpdateAvailable((info) => {
      setUpdateInfo(info)
      setDismissed(false)
    })

    return () => unsubscribe()
  }, [])

  if (!updateInfo || dismissed) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lg)',
        padding: '16px',
        zIndex: 9999,
        width: '320px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              padding: '8px',
              backgroundColor: 'var(--primary-light)',
              borderRadius: '50%',
              color: 'var(--primary)'
            }}
          >
            <DownloadCloud size={20} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Có bản cập nhật mới!</h4>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-light)', marginTop: '2px' }}>
              Phiên bản {updateInfo.latest} đã sẵn sàng
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: 'var(--text-light)'
          }}
          title="Đóng"
        >
          <X size={16} />
        </button>
      </div>

      <button
        onClick={() => {
          setDismissed(true)
          if (updateInfo.downloadUrl) {
            window.ccpro.app.openExternal(updateInfo.downloadUrl)
          }
        }}
        style={{
          backgroundColor: 'var(--primary)',
          color: 'white',
          border: 'none',
          padding: '8px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 500,
          fontSize: '13px',
          textAlign: 'center',
          width: '100%'
        }}
      >
        Tải xuống ngay
      </button>
    </div>
  )
}
