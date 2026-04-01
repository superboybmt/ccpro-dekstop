import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()
const getAllWindowsMock = vi.fn(() => [
  {
    isDestroyed: () => false,
    webContents: {
      send: sendMock
    }
  }
])
const getVersionMock = vi.fn(() => '1.0.0')

vi.mock('electron', () => ({
  app: {
    getVersion: getVersionMock
  },
  BrowserWindow: {
    getAllWindows: getAllWindowsMock
  }
}))

describe('UpdateService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    sendMock.mockClear()
    getAllWindowsMock.mockClear()
    getVersionMock.mockReturnValue('1.0.0')
  })

  it('rewrites GitHub blob manifest URLs to the raw endpoint before fetching', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        latest: '1.0.1',
        downloadUrl: 'https://example.com/download.exe',
        releaseNotes: 'Bug fixes'
      })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { UpdateService } = await import('../update-service')
    const service = new UpdateService()

    await service.checkForUpdates()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [requestUrl] = fetchMock.mock.calls[0] ?? []
    expect(String(requestUrl)).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/superboybmt\/ccpro-dekstop\/main\/version\.json\?t=\d+$/
    )
  })

  it('ignores non-json manifest responses without surfacing a syntax error', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: async () => '<!DOCTYPE html><html></html>',
      json: vi.fn(async () => {
        throw new SyntaxError('Unexpected token < in JSON')
      })
    }))
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', fetchMock)

    const { UpdateService } = await import('../update-service')
    const service = new UpdateService()

    await expect(service.checkForUpdates()).resolves.toBeNull()

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Skipped update check because manifest response was not JSON.',
      expect.objectContaining({
        status: 200,
        contentType: 'text/html; charset=utf-8'
      })
    )
    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })
})
