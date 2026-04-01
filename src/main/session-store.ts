import { createRequire } from 'node:module'
import { formatAppIsoOffset } from '@shared/app-time'
import { appConfig } from './config/app-config'
import type { AdminSessionState, AdminUser, AuthUser, SessionState } from '@shared/api'

type ElectronStoreConstructor = typeof import('electron-store').default
type ElectronStoreModule = ElectronStoreConstructor | { default?: ElectronStoreConstructor }
type ElectronStoreOptions<T extends Record<string, unknown>> = import('electron-store').Options<T>

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

const createElectronStore = <T extends Record<string, unknown>>(
  options?: ElectronStoreOptions<T>
) => {
  const ElectronStore = loadElectronStore()

  return new ElectronStore<T>(options)
}

interface StoredSession {
  user: AuthUser
  mustChangePassword: boolean
  rememberMe: boolean
  lastActivityAt: string
}

interface StoredAdminSession {
  admin: AdminUser
  mustChangePassword: boolean
  lastActivityAt: string
}

interface SessionStoreShape {
  session?: StoredSession
  adminSession?: StoredAdminSession
}

export class SessionStore {
  private readonly store = createElectronStore<SessionStoreShape>({
    name: 'ccpro-session',
    encryptionKey: appConfig.sessionEncryptionKey
  })

  getSession(): SessionState {
    const session = this.store.get('session')

    if (!session) {
      return {
        authenticated: false,
        mustChangePassword: false,
        user: null
      }
    }

    const lastActivityAt = new Date(session.lastActivityAt).getTime()
    if (Date.now() - lastActivityAt > appConfig.sessionTtlMs) {
      this.clear()
      return {
        authenticated: false,
        mustChangePassword: false,
        user: null
      }
    }

    if (session.rememberMe) {
      this.touch()
    }

    return {
      authenticated: true,
      mustChangePassword: session.mustChangePassword,
      user: session.user
    }
  }

  setSession(user: AuthUser, mustChangePassword: boolean, rememberMe: boolean): void {
    this.store.set('session', {
      user,
      mustChangePassword,
      rememberMe,
      lastActivityAt: formatAppIsoOffset(new Date())
    })
  }

  touch(): void {
    const session = this.store.get('session')
    if (!session) return

    this.store.set('session', {
      ...session,
      lastActivityAt: formatAppIsoOffset(new Date())
    })
  }

  completePasswordChange(): void {
    const session = this.store.get('session')
    if (!session) return

    this.store.set('session', {
      ...session,
      mustChangePassword: false,
      lastActivityAt: formatAppIsoOffset(new Date())
    })
  }

  clear(): void {
    this.store.delete('session')
  }

  // ── Admin session ──

  getAdminSession(): AdminSessionState {
    const session = this.store.get('adminSession')

    if (!session) {
      return { authenticated: false, mustChangePassword: false, admin: null }
    }

    const lastActivityAt = new Date(session.lastActivityAt).getTime()
    if (Date.now() - lastActivityAt > appConfig.sessionTtlMs) {
      this.clearAdmin()
      return { authenticated: false, mustChangePassword: false, admin: null }
    }

    this.touchAdmin()
    return {
      authenticated: true,
      mustChangePassword: session.mustChangePassword,
      admin: session.admin
    }
  }

  setAdminSession(admin: AdminUser, mustChangePassword: boolean): void {
    this.store.set('adminSession', {
      admin,
      mustChangePassword,
      lastActivityAt: formatAppIsoOffset(new Date())
    })
  }

  touchAdmin(): void {
    const session = this.store.get('adminSession')
    if (!session) return

    this.store.set('adminSession', {
      ...session,
      lastActivityAt: formatAppIsoOffset(new Date())
    })
  }

  completeAdminPasswordChange(): void {
    const session = this.store.get('adminSession')
    if (!session) return

    this.store.set('adminSession', {
      ...session,
      mustChangePassword: false,
      lastActivityAt: formatAppIsoOffset(new Date())
    })
  }

  clearAdmin(): void {
    this.store.delete('adminSession')
  }
}
