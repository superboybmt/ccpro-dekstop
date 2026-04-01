import { app, BrowserWindow } from 'electron'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { isSemverGreater } from '../../shared/semver'
import type { UpdateInfo } from '@shared/api'

export const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/superboybmt/ccpro-dekstop/main/version.json'
const LOCAL_MANIFEST_PATH = path.resolve(process.cwd(), 'version.json')

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

export class UpdateService {
  public async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      let data: UpdateInfo | null = null

      if (!app.isPackaged && !process.env.CCPRO_UPDATE_MANIFEST_URL) {
        data = await readLocalManifest()
      } else {
        const manifestUrl = process.env.CCPRO_UPDATE_MANIFEST_URL ?? UPDATE_MANIFEST_URL
        const url = `${normalizeManifestUrl(manifestUrl)}?t=${Date.now()}`
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
        if (!response.ok) {
          return null
        }

        data = await parseManifest(response)
      }

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

  private notifyRenderer(info: UpdateInfo) {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('app:update-available', info)
      }
    }
  }
}
