import type { BrowserWindowConstructorOptions } from 'electron'
import { join } from 'node:path'

export const createMainWindowOptions = (icon: string): BrowserWindowConstructorOptions => ({
  width: 1280,
  height: 720,
  minWidth: 1280,
  minHeight: 720,
  show: false,
  autoHideMenuBar: true,
  icon,
  title: 'CCPro PNJ',
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: true
  }
})
