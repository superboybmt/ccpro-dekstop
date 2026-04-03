import { useEffect, useState } from 'react'
import { DownloadCloud, X } from 'lucide-react'
import type { UpdateDownloadState, UpdateInfo } from '@shared/api'

export const UpdateNotifier = (): JSX.Element | null => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadState, setDownloadState] = useState<UpdateDownloadState | null>(null)

  useEffect(() => {
    let active = true

    const unsubscribe = window.ccpro.app.onUpdateAvailable((info) => {
      setUpdateInfo(info)
      setDismissed(false)
      setDownloadState(null)
    })

    window.ccpro.app
      .checkForUpdates()
      .then((info) => {
        if (!active || !info) {
          return
        }

        setUpdateInfo(info)
        setDismissed(false)
        setDownloadState(null)
      })
      .catch(console.error)

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  if (!updateInfo || dismissed) {
    return null
  }

  const shouldUseVerifiedDownload = Boolean(updateInfo.integrity?.checksumSha256)

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
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
              Có bản cập nhật mới!
            </h4>
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
        onClick={async () => {
          if (!shouldUseVerifiedDownload) {
            setDismissed(true)
            await window.ccpro.app.openExternal(updateInfo.downloadUrl)
            return
          }

          setIsDownloading(true)
          setDownloadState(null)

          try {
            const result = await window.ccpro.app.downloadVerifiedUpdate(updateInfo)
            setDownloadState(result)

            if (result.ok) {
              setDismissed(true)
            }
          } catch (error) {
            setDownloadState({
              ok: false,
              message: error instanceof Error ? error.message : 'Không thể tải bản cập nhật.'
            })
          } finally {
            setIsDownloading(false)
          }
        }}
        style={{
          backgroundColor: 'var(--primary)',
          color: 'white',
          border: 'none',
          padding: '8px 12px',
          borderRadius: '4px',
          cursor: isDownloading ? 'default' : 'pointer',
          fontWeight: 500,
          fontSize: '13px',
          textAlign: 'center',
          width: '100%',
          opacity: isDownloading ? 0.8 : 1
        }}
        disabled={isDownloading}
      >
        {isDownloading ? 'Đang tải bản cập nhật...' : 'Tải xuống ngay'}
      </button>

      {downloadState && !downloadState.ok ? (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--danger, #b42318)' }}>{downloadState.message}</p>
      ) : null}
    </div>
  )
}
