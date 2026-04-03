import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UpdateNotifier } from '../UpdateNotifier'

describe('UpdateNotifier', () => {
  it('subscribes before triggering update checks so immediate update events are not missed', async () => {
    let updateListener: ((info: { latest: string; downloadUrl: string; releaseNotes?: string }) => void) | null = null

    window.ccpro = {
      auth: undefined as never,
      admin: undefined as never,
      adminUsers: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never,
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      adminShifts: undefined as never,
      app: {
        checkForUpdates: vi.fn(async () => {
          updateListener?.({
            latest: '1.0.2',
            downloadUrl: 'https://example.com/download.exe',
            releaseNotes: 'Bug fixes'
          })
        }),
        downloadVerifiedUpdate: vi.fn(async () => ({ ok: true, message: 'ok' })),
        openExternal: vi.fn(async () => undefined),
        onUpdateAvailable: vi.fn((callback) => {
          updateListener = callback
          return () => {
            updateListener = null
          }
        })
      }
    }

    render(<UpdateNotifier />)

    expect(await screen.findByText(/1\.0\.2/i)).toBeInTheDocument()
  })

  it('uses the verified download flow instead of opening the raw URL', async () => {
    const downloadVerifiedUpdate = vi.fn(async () => ({
      ok: true,
      message: 'Downloaded',
      filePath: 'E:/temp/CCPro-Portable-1.0.3.exe'
    }))
    const openExternal = vi.fn(async () => undefined)

    window.ccpro = {
      auth: undefined as never,
      admin: undefined as never,
      adminUsers: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never,
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      adminShifts: undefined as never,
      app: {
        checkForUpdates: vi.fn(async () => ({
          latest: '1.0.3',
          downloadUrl: 'https://example.com/download-1.0.3.exe',
          releaseNotes: 'Hot fix',
          integrity: {
            checksumSha256: 'b'.repeat(64),
            signature: 'signature',
            signedFieldsVersion: 1,
            status: 'verified' as const
          }
        })),
        downloadVerifiedUpdate,
        openExternal,
        onUpdateAvailable: vi.fn(() => () => undefined)
      }
    }

    render(<UpdateNotifier />)

    const button = await screen.findByRole('button', { name: /tải xuống ngay/i })
    fireEvent.click(button)

    await waitFor(() => {
      expect(downloadVerifiedUpdate).toHaveBeenCalledTimes(1)
    })

    expect(openExternal).not.toHaveBeenCalled()
  })

  it('shows a readable error and keeps the card open when verified download fails', async () => {
    const downloadVerifiedUpdate = vi.fn(async () => ({
      ok: false,
      message: 'Checksum bản cập nhật không khớp. Đã hủy cài đặt.'
    }))

    window.ccpro = {
      auth: undefined as never,
      admin: undefined as never,
      adminUsers: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never,
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      adminShifts: undefined as never,
      app: {
        checkForUpdates: vi.fn(async () => ({
          latest: '1.0.4',
          downloadUrl: 'https://example.com/download-1.0.4.exe',
          releaseNotes: 'Signed release',
          integrity: {
            checksumSha256: 'c'.repeat(64),
            signature: 'signature',
            signedFieldsVersion: 1,
            status: 'verified' as const
          }
        })),
        downloadVerifiedUpdate,
        openExternal: vi.fn(async () => undefined),
        onUpdateAvailable: vi.fn(() => () => undefined)
      }
    }

    render(<UpdateNotifier />)

    fireEvent.click(await screen.findByRole('button', { name: /tải xuống ngay/i }))

    expect(await screen.findByText(/checksum bản cập nhật không khớp/i)).toBeInTheDocument()
    expect(screen.getByText(/1\.0\.4/i)).toBeInTheDocument()
  })

  it('keeps legacy manifests usable by opening the remote URL directly', async () => {
    const openExternal = vi.fn(async () => undefined)
    const downloadVerifiedUpdate = vi.fn(async () => ({ ok: true, message: 'ok' }))

    window.ccpro = {
      auth: undefined as never,
      admin: undefined as never,
      adminUsers: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never,
      machineConfig: undefined as never,
      adminSettings: undefined as never,
      adminShifts: undefined as never,
      app: {
        checkForUpdates: vi.fn(async () => ({
          latest: '1.0.5',
          downloadUrl: 'https://example.com/download-1.0.5.exe',
          releaseNotes: 'Legacy release',
          integrity: {
            status: 'legacy' as const
          }
        })),
        downloadVerifiedUpdate,
        openExternal,
        onUpdateAvailable: vi.fn(() => () => undefined)
      }
    }

    render(<UpdateNotifier />)

    fireEvent.click(await screen.findByRole('button', { name: /tải xuống ngay/i }))

    await waitFor(() => {
      expect(openExternal).toHaveBeenCalledWith('https://example.com/download-1.0.5.exe')
    })

    expect(downloadVerifiedUpdate).not.toHaveBeenCalled()
  })
})
