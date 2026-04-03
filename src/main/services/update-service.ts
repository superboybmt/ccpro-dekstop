import { app, BrowserWindow, shell } from 'electron'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { isSemverGreater } from '../../shared/semver'
import type { UpdateDownloadState, UpdateInfo, UpdateIntegrityInfo } from '@shared/api'
import { isAllowedExternalUrl } from '../external-url'
import { appConfig } from '../config/app-config'
import {
  buildSignedManifestPayload,
  hashFileSha256,
  isValidSha256,
  verifyManifestSignature
} from './update-integrity'

export const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/superboybmt/ccpro-dekstop/main/version.json'
const LOCAL_MANIFEST_PATH = path.resolve(process.cwd(), 'version.json')
const UPDATE_DOWNLOAD_DIR = 'ccpro-updates'

const normalizeManifestUrl = (value: string): string => {
  try {
    const url = new URL(value)

    if (url.hostname === 'github.com') {
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length >= 5 && parts[2] === 'blob') {
        const [owner, repo, , branch, ...pathParts] = parts
        return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${pathParts.join('/')}`
      }
    }

    if (url.hostname === 'raw.githubusercontent.com') {
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length >= 5 && parts[2] === 'refs' && parts[3] === 'heads') {
        const [owner, repo, , , branch, ...pathParts] = parts
        return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${pathParts.join('/')}`
      }
    }
  } catch {
    return value
  }

  return value
}

const parseManifest = async (response: Response): Promise<UpdateInfo | null> => {
  const contentType = response.headers.get('content-type') ?? ''
  const status = response.status || 200

  if (contentType.includes('application/json') && typeof response.json === 'function') {
    return (await response.json()) as UpdateInfo
  }

  const text = typeof response.text === 'function' ? await response.text() : ''
  const trimmed = text.trimStart()

  if (contentType.includes('text/html') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    console.warn('Skipped update check because manifest response was not JSON.', {
      status,
      contentType
    })
    return null
  }

  try {
    return JSON.parse(text) as UpdateInfo
  } catch {
    console.warn('Skipped update check because manifest response was not JSON.', {
      status,
      contentType
    })
    return null
  }
}

const readLocalManifest = async (): Promise<UpdateInfo | null> => {
  try {
    const text = await fs.readFile(LOCAL_MANIFEST_PATH, 'utf8')
    return JSON.parse(text) as UpdateInfo
  } catch (error) {
    console.warn('Skipped update check because local manifest could not be read.', {
      path: LOCAL_MANIFEST_PATH,
      error: error instanceof Error ? error.message : 'unknown'
    })
    return null
  }
}

const isIntegrityMetadataPresent = (integrity: UpdateIntegrityInfo | undefined): boolean =>
  Boolean(integrity?.checksumSha256 || integrity?.signature || integrity?.signedFieldsVersion)

const verifyIntegrity = (info: UpdateInfo): UpdateInfo | null => {
  const integrity = info.integrity
  const hasIntegrityMetadata = isIntegrityMetadataPresent(integrity)

  if (!hasIntegrityMetadata) {
    if (appConfig.updateIntegrity.mode === 'enforce') {
      console.warn('Skipped update check because manifest integrity metadata was required.', {
        latest: info.latest
      })
      return null
    }

    return {
      ...info,
      integrity: {
        status: 'legacy'
      }
    }
  }

  if (
    !integrity ||
    !integrity.signature ||
    !integrityPublicKeyAvailable() ||
    !isValidSha256(integrity.checksumSha256 ?? '') ||
    !Number.isInteger(integrity.signedFieldsVersion)
  ) {
    console.warn('Skipped update check because manifest integrity metadata was invalid.', {
      latest: info.latest
    })
    return null
  }

  const payload = buildSignedManifestPayload(info)
  if (!verifyManifestSignature(payload, integrity.signature, appConfig.updateIntegrity.publicKey!)) {
    console.warn('Skipped update check because manifest signature verification failed.', {
      latest: info.latest
    })
    return null
  }

  return {
    ...info,
    integrity: {
      ...integrity,
      status: 'verified'
    }
  }
}

const integrityPublicKeyAvailable = (): boolean => typeof appConfig.updateIntegrity.publicKey === 'string'

const sanitizeUpdateInfo = (info: UpdateInfo | null): UpdateInfo | null => {
  if (!info) {
    return null
  }

  if (!isAllowedExternalUrl(info.downloadUrl)) {
    console.warn('Skipped update check because manifest download URL was not HTTPS.', {
      downloadUrl: info.downloadUrl
    })
    return null
  }

  return verifyIntegrity(info)
}

const ensureUpdateFileName = (info: UpdateInfo): string => {
  try {
    const url = new URL(info.downloadUrl)
    const fileName = path.basename(url.pathname)
    if (fileName.length > 0) {
      return fileName
    }
  } catch {
    // Fall through to generated name.
  }

  return `CCPro-Portable-${info.latest}.exe`
}

export class UpdateService {
  public async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      let data: UpdateInfo | null = null

      if (!app.isPackaged && !process.env.CCPRO_UPDATE_MANIFEST_URL) {
        data = await readLocalManifest()
      } else {
        const manifestUrl = process.env.CCPRO_UPDATE_MANIFEST_URL ?? UPDATE_MANIFEST_URL
        const normalizedManifestUrl = normalizeManifestUrl(manifestUrl)
        if (!isAllowedExternalUrl(normalizedManifestUrl)) {
          console.warn('Skipped update check because manifest URL was not HTTPS.', {
            manifestUrl
          })
          return null
        }

        const url = `${normalizedManifestUrl}?t=${Date.now()}`
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
        if (!response.ok) {
          return null
        }

        data = await parseManifest(response)
      }

      data = sanitizeUpdateInfo(data)

      const currentVersion = app.getVersion()

      if (data && data.latest && isSemverGreater(data.latest, currentVersion)) {
        this.notifyRenderer(data)
        return data
      }
    } catch (err) {
      console.error('Failed to perform update check:', err)
    }
    return null
  }

  public async downloadVerifiedUpdate(info: UpdateInfo): Promise<UpdateDownloadState> {
    if (!isAllowedExternalUrl(info.downloadUrl)) {
      return {
        ok: false,
        message: 'Liên kết tải bản cập nhật không hợp lệ.'
      }
    }

    const checksum = info.integrity?.checksumSha256
    if (!checksum || !isValidSha256(checksum)) {
      return {
        ok: false,
        message: 'Bản cập nhật chưa có checksum để xác thực.'
      }
    }

    const targetDir = path.join(app.getPath('temp'), UPDATE_DOWNLOAD_DIR)
    const filePath = path.join(targetDir, ensureUpdateFileName(info))

    try {
      await fs.mkdir(targetDir, { recursive: true })
      const response = await fetch(info.downloadUrl, { signal: AbortSignal.timeout(30_000) })
      if (!response.ok) {
        return {
          ok: false,
          message: 'Không thể tải bản cập nhật.'
        }
      }

      const content = Buffer.from(await response.arrayBuffer())
      await fs.writeFile(filePath, content)

      const actualChecksum = await hashFileSha256(filePath)
      if (actualChecksum !== checksum.toLowerCase()) {
        await fs.unlink(filePath).catch(() => undefined)
        return {
          ok: false,
          message: 'Checksum bản cập nhật không khớp. Đã hủy cài đặt.'
        }
      }

      const openResult = await shell.openPath(filePath)
      if (openResult) {
        return {
          ok: false,
          message: openResult
        }
      }

      return {
        ok: true,
        message: 'Đã tải và mở bản cập nhật đã xác thực.',
        filePath
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Không thể tải bản cập nhật.'
      }
    }
  }

  private notifyRenderer(info: UpdateInfo) {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('app:update-available', info)
      }
    }
  }
}
