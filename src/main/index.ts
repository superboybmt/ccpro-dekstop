import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { formatAppIsoOffset } from '@shared/app-time'
import { appConfig } from './config/app-config'
import { initializeAppDatabase } from './db/init'
import { closePools } from './db/sql'
import { registerIpcHandlers } from './ipc/register-handlers'
import {
  DeviceSyncService,
  PythonDeviceSyncWorker,
  SqlDeviceSyncRepository
} from './services/device-sync-service'
import { startApplication } from './startup'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const deviceSyncService = new DeviceSyncService(new SqlDeviceSyncRepository(), new PythonDeviceSyncWorker(), {
  deviceIp: appConfig.deviceSync.ip
})

const earlyLogFile = join(process.env.TEMP ?? process.cwd(), 'ccpro-startup.log')

const logEarly = (message: string): void => {
  try {
    appendFileSync(earlyLogFile, `[${formatAppIsoOffset(new Date())}] ${message}\n`)
  } catch {
    // Early logging is best effort only.
  }
}

const logStartup = (message: string): void => {
  try {
    const userDataPath = app.getPath('userData')
    mkdirSync(userDataPath, { recursive: true })
    appendFileSync(join(userDataPath, 'startup.log'), `[${formatAppIsoOffset(new Date())}] ${message}\n`)
  } catch {
    // Logging must never block app startup.
  }
}

logEarly(`module:loaded appType=${typeof app}`)

const createWindow = (): void => {
  logStartup('createWindow:start')
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../resources/icon.png'),
    title: 'App Chấm công PNJ',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const revealWindow = (): void => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) {
      return
    }

    logStartup('createWindow:show')
    mainWindow.show()
  }

  mainWindow.once('ready-to-show', () => {
    logStartup('createWindow:ready-to-show')
    revealWindow()
  })

  mainWindow.webContents.once('did-finish-load', () => {
    logStartup('createWindow:did-finish-load')
    revealWindow()
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logStartup(`createWindow:did-fail-load:${errorCode}:${errorDescription}`)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logStartup(`createWindow:render-process-gone:${details.reason}`)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    logStartup(`createWindow:loadURL:${process.env.ELECTRON_RENDERER_URL}`)
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    logStartup('createWindow:loadFile')
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  setTimeout(revealWindow, 1500)
}

const createTray = (): void => {
  const trayIcon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  if (trayIcon.isEmpty()) {
    throw new Error('Tray icon is not configured')
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('App Chấm công PNJ')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Mở ứng dụng',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Thoát',
        click: () => {
          app.quit()
        }
      }
    ])
  )

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

app.whenReady()
  .then(async () => {
    logStartup('app:ready')
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.ccpro.desktop')
    }

    await startApplication({
      initializeAppDatabase,
      registerIpcHandlers: (options) => {
        registerIpcHandlers({
          ...options,
          deviceSyncService
        })
        void deviceSyncService.start(options.ensureAppReady)
      },
      createWindow,
      createTray,
      onActivate: (handler) => {
        app.on('activate', handler)
      },
      getWindowCount: () => BrowserWindow.getAllWindows().length,
      log: logStartup
    })
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    logStartup(`app:startup-error:${message}`)
    throw error
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  await deviceSyncService.stop()
  await closePools()
})
