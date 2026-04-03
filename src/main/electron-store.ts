import { createRequire } from 'node:module'

export type ElectronStoreConstructor = typeof import('electron-store').default
type ElectronStoreModule = ElectronStoreConstructor | { default?: ElectronStoreConstructor }
export type ElectronStoreOptions<T extends Record<string, unknown>> = import('electron-store').Options<T>

const require = createRequire(import.meta.url)

export const resolveStoreConstructor = (
  storeModule: ElectronStoreModule
): ElectronStoreConstructor => {
  const constructor = typeof storeModule === 'function' ? storeModule : storeModule.default

  if (typeof constructor !== 'function') {
    throw new TypeError('electron-store export is not a constructor')
  }

  return constructor
}

const loadElectronStore = (): ElectronStoreConstructor =>
  resolveStoreConstructor(require('electron-store') as ElectronStoreModule)

export const createElectronStore = <T extends Record<string, unknown>>(
  options?: ElectronStoreOptions<T>
) => {
  const ElectronStore = loadElectronStore()

  return new ElectronStore<T>(options)
}
