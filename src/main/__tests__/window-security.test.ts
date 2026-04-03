import { describe, expect, it } from 'vitest'
import { createMainWindowOptions } from '../window-options'

describe('createMainWindowOptions', () => {
  it('keeps the main BrowserWindow behind preload with sandbox enabled', () => {
    const options = createMainWindowOptions('icon.png')

    expect(options.webPreferences?.preload).toMatch(/preload[\\/]index\.js$/)
    expect(options.webPreferences?.nodeIntegration).not.toBe(true)
    expect(options.webPreferences?.sandbox).toBe(true)
  })
})
