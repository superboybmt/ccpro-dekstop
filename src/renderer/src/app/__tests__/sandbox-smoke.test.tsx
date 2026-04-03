import { render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import type { RendererApi } from '@shared/api'

const createApi = (): RendererApi => ({
  auth: {
    login: vi.fn(async () => ({ ok: false, requiresPasswordChange: false })),
    getSession: vi.fn(async () => ({
      authenticated: false,
      mustChangePassword: false,
      user: null
    })),
    changePassword: vi.fn(async () => ({ ok: true, message: 'ok' })),
    logout: vi.fn(async () => undefined)
  },
  attendance: {
    getDashboard: vi.fn(async () => ({
      shift: null,
      timeline: [],
      nextAction: 'check-in',
      lastEventAt: null,
      connectionStatus: 'connected'
    })),
    checkIn: vi.fn(async () => ({ ok: true, message: 'ok' })),
    checkOut: vi.fn(async () => ({ ok: true, message: 'ok' })),
    getHistory: vi.fn(async () => ({
      filter: { month: null, startDate: '2026-04-01', endDate: '2026-04-02', page: 1, pageSize: 10 },
      stats: { totalWorkingDays: 0, onTimeRate: 0, totalOvertimeHours: 0, absences: 0 },
      records: [],
      total: 0
    }))
  },
  notifications: {
    list: vi.fn(async () => []),
    markRead: vi.fn(async () => undefined),
    markAllRead: vi.fn(async () => undefined)
  },
  settings: {
    getProfile: vi.fn(async () => ({
      fullName: 'Nguyen Van A',
      employeeCode: 'E0112599',
      department: 'IT',
      hireDate: '2026-01-01',
      scheduleName: 'Hanh chanh'
    })),
    getAppInfo: vi.fn(async () => ({
      version: '1.0.0',
      buildNumber: '1.0.0',
      connectionStatus: 'connected',
      lastSyncAt: null
    })),
    updateAvatar: vi.fn(async () => ({ ok: true, message: 'ok' })),
    removeAvatar: vi.fn(async () => ({ ok: true, message: 'ok' }))
  },
  deviceSync: {
    getStatus: vi.fn(async () => ({
      status: 'ok',
      deviceIp: '10.60.1.5',
      lastSyncAt: null,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastImportedCount: 0,
      lastSkippedCount: 0,
      lastError: null
    })),
    retry: vi.fn(async () => ({
      status: 'ok',
      deviceIp: '10.60.1.5',
      lastSyncAt: null,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastImportedCount: 0,
      lastSkippedCount: 0,
      lastError: null
    }))
  },
  admin: {
    login: vi.fn(async () => ({ ok: false })),
    getSession: vi.fn(async () => ({ authenticated: false, mustChangePassword: false, admin: null })),
    changePassword: vi.fn(async () => ({ ok: true, message: 'ok' })),
    listAdmins: vi.fn(async () => ({ admins: [] })),
    resetPassword: vi.fn(async () => ({ ok: true, message: 'ok' })),
    logout: vi.fn(async () => undefined),
    bootstrap: vi.fn(async () => ({ ok: true, message: 'ok' }))
  },
  adminUsers: {
    listUsers: vi.fn(async () => ({ users: [] })),
    setUserActiveState: vi.fn(async () => ({ ok: true, message: 'ok' })),
    resetUserPassword: vi.fn(async () => ({ ok: true, message: 'ok' }))
  },
  machineConfig: {
    getConfig: vi.fn(async () => ({ stateMode: 2, schedule: [] })),
    saveConfig: vi.fn(async () => ({ ok: true, message: 'ok' })),
    syncTime: vi.fn(async () => ({ ok: true, message: 'ok' }))
  },
  adminSettings: {
    getRemoteRiskPolicy: vi.fn(async () => ({ mode: 'audit_only' })),
    saveRemoteRiskPolicy: vi.fn(async () => ({ ok: true, message: 'ok', mode: 'audit_only' }))
  },
  adminShifts: {
    listShifts: vi.fn(async () => ({ shifts: [] })),
    updateShift: vi.fn(async () => ({ ok: true, message: 'ok' }))
  },
  app: {
    checkForUpdates: vi.fn(async () => null),
    downloadVerifiedUpdate: vi.fn(async () => ({ ok: true, message: 'ok', filePath: null })),
    openExternal: vi.fn(async () => undefined),
    onUpdateAvailable: vi.fn(() => () => undefined)
  }
})

const SandboxSmokeHarness = (): JSX.Element => {
  const [status, setStatus] = useState('booting')

  useEffect(() => {
    void Promise.all([
      window.ccpro.auth.getSession(),
      window.ccpro.settings.getAppInfo(),
      window.ccpro.app.checkForUpdates()
    ]).then(() => {
      setStatus('ready')
    })
  }, [])

  return <div>{status}</div>
}

describe('sandbox smoke', () => {
  it('can access the preload bridge shape used by the renderer', async () => {
    const api = createApi()
    window.ccpro = api

    render(<SandboxSmokeHarness />)

    expect(screen.getByText('booting')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument()
    })

    expect(api.auth.getSession).toHaveBeenCalledTimes(1)
    expect(api.settings.getAppInfo).toHaveBeenCalledTimes(1)
    expect(api.app.checkForUpdates).toHaveBeenCalledTimes(1)
  })
})
