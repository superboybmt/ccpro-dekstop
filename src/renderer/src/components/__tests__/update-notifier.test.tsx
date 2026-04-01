import { render, screen } from '@testing-library/react'
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
      app: {
        checkForUpdates: vi.fn(async () => {
          updateListener?.({
            latest: '1.0.2',
            downloadUrl: 'https://example.com/download.exe',
            releaseNotes: 'Bug fixes'
          })
        }),
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

  it('shows an update when startup check returns update info directly even without an event', async () => {
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
      app: {
        checkForUpdates: vi.fn(async () => ({
          latest: '1.0.3',
          downloadUrl: 'https://example.com/download-1.0.3.exe',
          releaseNotes: 'Hot fix'
        })),
        openExternal: vi.fn(async () => undefined),
        onUpdateAvailable: vi.fn(() => () => undefined)
      }
    }

    render(<UpdateNotifier />)

    expect(await screen.findByText(/1\.0\.3/i)).toBeInTheDocument()
  })
})
