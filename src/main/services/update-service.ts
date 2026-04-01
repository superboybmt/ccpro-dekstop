import { app, BrowserWindow } from 'electron'
import { isSemverGreater } from '../../shared/semver'
import type { UpdateInfo } from '@shared/api'

// TODO: Replace with the actual URL from where to fetch version.json
export const UPDATE_MANIFEST_URL = 'https://github.com/superboybmt/ccpro-dekstop/blob/main/version.json'

export class UpdateService {
  public async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      const url = `${UPDATE_MANIFEST_URL}?t=${Date.now()}`
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as UpdateInfo
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
