import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from 'react'
import type { LoginPayload, LoginResult, SessionState } from '@shared/api'

interface AuthContextValue extends SessionState {
  ready: boolean
  login(payload: LoginPayload): Promise<LoginResult>
  logout(): Promise<void>
  refreshSession(): Promise<void>
  markPasswordChanged(): void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const defaultSession: SessionState = {
  authenticated: false,
  mustChangePassword: false,
  user: null
}

export const AuthProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<SessionState>(defaultSession)

  const refreshSession = async (): Promise<void> => {
    const nextSession = await window.ccpro.auth.getSession()
    setSession(nextSession)
    setReady(true)
  }

  useEffect(() => {
    void refreshSession()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...session,
      ready,
      login: async (payload) => {
        const result = await window.ccpro.auth.login(payload)
        if (result.ok && result.user) {
          setSession({
            authenticated: true,
            mustChangePassword: result.requiresPasswordChange,
            user: result.user
          })
        }
        return result
      },
      logout: async () => {
        await window.ccpro.auth.logout()
        setSession(defaultSession)
      },
      refreshSession,
      markPasswordChanged: () => {
        setSession((current) => ({
          ...current,
          mustChangePassword: false
        }))
      }
    }),
    [ready, session]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
