import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSign, generateKeyPairSync } from 'node:crypto'

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
const appGetPathMock = vi.fn(() => 'E:/temp')
const shellOpenPathMock = vi.fn(async () => '')
const readFileMock = vi.fn()
const writeFileMock = vi.fn(async () => undefined)
const mkdirMock = vi.fn(async () => undefined)
const unlinkMock = vi.fn(async () => undefined)
let isPackaged = true
let manifestUrlOverride: string | undefined
let integrityMode: 'audit' | 'enforce' = 'audit'
let integrityPublicKey: string | null = null

vi.mock('electron', () => ({
  app: {
    getVersion: getVersionMock,
    getPath: appGetPathMock,
    get isPackaged() {
      return isPackaged
    }
  },
  BrowserWindow: {
    getAllWindows: getAllWindowsMock
  },
  shell: {
    openPath: shellOpenPathMock
  }
}))

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
  writeFile: writeFileMock,
  mkdir: mkdirMock,
  unlink: unlinkMock,
  default: {
    readFile: readFileMock,
    writeFile: writeFileMock,
    mkdir: mkdirMock,
    unlink: unlinkMock
  }
}))

vi.mock('../../config/app-config', () => ({
  appConfig: {
    updateIntegrity: {
      get mode() {
        return integrityMode
      },
      get publicKey() {
        return integrityPublicKey
      }
    }
  }
}))

const signManifestPayload = (payload: string, privateKey: string): string => {
  const signer = createSign('RSA-SHA256')
  signer.update(payload)
  signer.end()
  return signer.sign(privateKey, 'base64')
}

describe('UpdateService', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    sendMock.mockClear()
    getAllWindowsMock.mockClear()
    getVersionMock.mockReturnValue('1.0.0')
    appGetPathMock.mockReturnValue('E:/temp')
    shellOpenPathMock.mockReset()
    shellOpenPathMock.mockResolvedValue('')
    readFileMock.mockReset()
    writeFileMock.mockReset()
    writeFileMock.mockResolvedValue(undefined)
    mkdirMock.mockReset()
    mkdirMock.mockResolvedValue(undefined)
    unlinkMock.mockReset()
    unlinkMock.mockResolvedValue(undefined)
    isPackaged = true
    integrityMode = 'audit'
    integrityPublicKey = null
    manifestUrlOverride = process.env.CCPRO_UPDATE_MANIFEST_URL
    delete process.env.CCPRO_UPDATE_MANIFEST_URL
  })

  afterEach(() => {
    if (manifestUrlOverride) {
      process.env.CCPRO_UPDATE_MANIFEST_URL = manifestUrlOverride
    } else {
      delete process.env.CCPRO_UPDATE_MANIFEST_URL
    }
  })

  it('rewrites GitHub blob manifest URLs to the raw endpoint before fetching', async () => {
    process.env.CCPRO_UPDATE_MANIFEST_URL = 'https://github.com/superboybmt/ccpro-dekstop/blob/main/version.json'

    const fetchMock = vi.fn<any>(async () => ({
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

  it('reads the local manifest file while running unpackaged in dev mode and marks it as legacy', async () => {
    isPackaged = false
    readFileMock.mockResolvedValue(
      JSON.stringify({
        latest: '1.0.3',
        downloadUrl: 'https://example.com/download-1.0.3.exe',
        releaseNotes: 'Hot fix'
      })
    )
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { UpdateService } = await import('../update-service')
    const service = new UpdateService()

    await expect(service.checkForUpdates()).resolves.toEqual({
      latest: '1.0.3',
      downloadUrl: 'https://example.com/download-1.0.3.exe',
      releaseNotes: 'Hot fix',
      integrity: {
        status: 'legacy'
      }
    })

    expect(readFileMock).toHaveBeenCalledWith(expect.stringMatching(/version\.json$/), 'utf8')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(sendMock).toHaveBeenCalledWith('app:update-available', {
      latest: '1.0.3',
      downloadUrl: 'https://example.com/download-1.0.3.exe',
      releaseNotes: 'Hot fix',
      integrity: {
        status: 'legacy'
      }
    })
  })

  it('rejects invalid signed manifests even in audit mode', async () => {
    integrityPublicKey = '-----BEGIN PUBLIC KEY-----\ninvalid\n-----END PUBLIC KEY-----'
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        latest: '1.0.1',
        downloadUrl: 'https://example.com/download.exe',
        releaseNotes: 'Bug fixes',
        integrity: {
          checksumSha256: 'a'.repeat(64),
          signature: 'invalid-signature',
          signedFieldsVersion: 1
        }
      })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { UpdateService } = await import('../update-service')
    const service = new UpdateService()

    await expect(service.checkForUpdates()).resolves.toBeNull()
    expect(consoleWarnSpy).toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('accepts signed manifests with a valid signature and marks them as verified', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    integrityPublicKey = publicKey.export({ type: 'spki', format: 'pem' }).toString()

    const manifest: any = {
      latest: '1.0.4',
      downloadUrl: 'https://example.com/download-1.0.4.exe',
      releaseNotes: 'Signed release',
      integrity: {
        checksumSha256: 'b'.repeat(64),
        signedFieldsVersion: 1
      }
    }

    const { buildSignedManifestPayload } = await import('../update-integrity')
    const payload = buildSignedManifestPayload(manifest)
    manifest.integrity.signature = signManifestPayload(
      payload,
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    )

    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => manifest
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { UpdateService } = await import('../update-service')
    const service = new UpdateService()

    await expect(service.checkForUpdates()).resolves.toEqual({
      latest: '1.0.4',
      downloadUrl: 'https://example.com/download-1.0.4.exe',
      releaseNotes: 'Signed release',
      integrity: {
        checksumSha256: 'b'.repeat(64),
        signature: manifest.integrity.signature,
        signedFieldsVersion: 1,
        status: 'verified'
      }
    })
  })

  it('rejects unsigned manifests in enforce mode', async () => {
    integrityMode = 'enforce'
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        latest: '1.0.2',
        downloadUrl: 'https://example.com/download.exe',
        releaseNotes: 'Unsigned'
      })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { UpdateService } = await import('../update-service')
    const service = new UpdateService()

    await expect(service.checkForUpdates()).resolves.toBeNull()
    expect(consoleWarnSpy).toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('skips update checks when the manifest URL override is not HTTPS', async () => {
    process.env.CCPRO_UPDATE_MANIFEST_URL = 'http://example.com/version.json'
    const fetchMock = vi.fn()
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', fetchMock)

    const { UpdateService } = await import('../update-service')
    const service = new UpdateService()

    await expect(service.checkForUpdates()).resolves.toBeNull()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Skipped update check because manifest URL was not HTTPS.',
      expect.objectContaining({
        manifestUrl: 'http://example.com/version.json'
      })
    )
  })

  it('ignores update manifests whose download URL is not HTTPS', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        latest: '1.0.1',
        downloadUrl: 'file:///C:/malware.exe',
        releaseNotes: 'Malicious payload'
      })
    }))
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', fetchMock)

    const { UpdateService } = await import('../update-service')
    const service = new UpdateService()

    await expect(service.checkForUpdates()).resolves.toBeNull()

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Skipped update check because manifest download URL was not HTTPS.',
      expect.objectContaining({
        downloadUrl: 'file:///C:/malware.exe'
      })
    )
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('ignores non-json manifest responses without surfacing a syntax error', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
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

  it('downloads a verified update, checks the checksum, and opens the local file', async () => {
    const content = Buffer.from('verified-installer')
    readFileMock.mockImplementation(async (filePath: string) => {
      if (String(filePath).includes('ccpro-updates')) {
        return content
      }

      return ''
    })
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => content
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { UpdateService } = await import('../update-service')
    const service = new UpdateService()

    const result = await service.downloadVerifiedUpdate({
      latest: '1.0.4',
      downloadUrl: 'https://example.com/download-1.0.4.exe',
      integrity: {
        checksumSha256: 'f3a5a3449d7bebc6b1b0b2b30509b0f634bfe1104c2db73a944a428e916a4f25',
        status: 'verified'
      }
    })

    expect(mkdirMock).toHaveBeenCalled()
    expect(writeFileMock).toHaveBeenCalled()
    expect(shellOpenPathMock).toHaveBeenCalledWith('E:\\temp\\ccpro-updates\\download-1.0.4.exe')
    expect(result).toEqual({
      ok: true,
      message: 'Đã tải và mở bản cập nhật đã xác thực.',
      filePath: 'E:\\temp\\ccpro-updates\\download-1.0.4.exe'
    })
  })

  it('rejects verified downloads whose checksum does not match', async () => {
    readFileMock.mockImplementation(async (filePath: string) => {
      if (String(filePath).includes('ccpro-updates')) {
        return Buffer.from('tampered-installer')
      }

      return ''
    })
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => Buffer.from('tampered-installer')
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { UpdateService } = await import('../update-service')
    const service = new UpdateService()

    const result = await service.downloadVerifiedUpdate({
      latest: '1.0.4',
      downloadUrl: 'https://example.com/download-1.0.4.exe',
      integrity: {
        checksumSha256: 'f3a5a3449d7bebc6b1b0b2b30509b0f634bfe1104c2db73a944a428e916a4f25',
        status: 'verified'
      }
    })

    expect(unlinkMock).toHaveBeenCalledWith('E:\\temp\\ccpro-updates\\download-1.0.4.exe')
    expect(shellOpenPathMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      message: 'Checksum bản cập nhật không khớp. Đã hủy cài đặt.'
    })
  })

  it('refuses verified download flow when the manifest has no checksum', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { UpdateService } = await import('../update-service')
    const service = new UpdateService()

    const result = await service.downloadVerifiedUpdate({
      latest: '1.0.4',
      downloadUrl: 'https://example.com/download-1.0.4.exe',
      integrity: {
        status: 'legacy'
      }
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      message: 'Bản cập nhật chưa có checksum để xác thực.'
    })
  })
})
