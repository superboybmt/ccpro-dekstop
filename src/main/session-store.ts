import { formatAppIsoOffset } from '@shared/app-time'
import { appConfig } from './config/app-config'
import { createElectronStore } from './electron-store'
import { getOrCreateSessionEncryptionKey } from './session-key-store'
import type { AdminSessionState, AdminUser, AuthUser, SessionState } from '@shared/api'

export { resolveStoreConstructor } from './electron-store'

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

interface SessionStoreShape extends Record<string, unknown> {
  session?: StoredSession
  adminSession?: StoredAdminSession
}

export class SessionStore {
  private readonly store = createElectronStore<SessionStoreShape>({
    name: 'ccpro-session',
    encryptionKey: getOrCreateSessionEncryptionKey(),
    clearInvalidConfig: true
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

  updateAvatar(base64: string | undefined): void {
    const session = this.store.get('session')
    if (!session?.user) return

    this.store.set('session', {
      ...session,
      user: {
        ...session.user,
        avatarBase64: base64
      },
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
