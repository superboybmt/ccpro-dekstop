import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AdminDeviceConfigPage } from '../admin-device-config-page'

const buildAdminSession = () => ({
  authenticated: true,
  admin: {
    id: 1,
    username: 'admin',
    displayName: 'Admin',
    role: 'super_admin'
  }
})

describe('AdminDeviceConfigPage', () => {
  it('renders the verified StateMode labels for ZKTeco punch-state modes', async () => {
    window.ccpro = {
      admin: {
        getSession: vi.fn(async () => buildAdminSession()),
        login: undefined as never,
        logout: vi.fn(async () => undefined),
        bootstrap: undefined as never
      },
      adminUsers: undefined as never,
      machineConfig: {
        getConfig: vi.fn(async () => ({
          stateMode: 2,
          schedule: [
            {
              stateKey: JSON.stringify({ statecode: '0', funcname: 'state0' }),
              stateList: JSON.stringify({ funcname: 'state0', StateName: 'Dang nhap' }),
              stateTimezone: JSON.stringify({ montime: '0' })
            },
            {
              stateKey: JSON.stringify({ statecode: '2', funcname: 'state2' }),
              stateList: JSON.stringify({ funcname: 'state2', StateName: 'Ra trua' }),
              stateTimezone: JSON.stringify({ montime: '1130' })
            },
            {
              stateKey: JSON.stringify({ statecode: '3', funcname: 'state3' }),
              stateList: JSON.stringify({ funcname: 'state3', StateName: 'Vao chieu' }),
              stateTimezone: JSON.stringify({ montime: '1300' })
            },
            {
              stateKey: JSON.stringify({ statecode: '1', funcname: 'state1' }),
              stateList: JSON.stringify({ funcname: 'state1', StateName: 'Dang xuat' }),
              stateTimezone: JSON.stringify({ montime: '1700' })
            }
          ]
        })),
        saveConfig: vi.fn(async () => ({
          ok: true,
          message: 'saved'
        })),
        syncTime: vi.fn(async () => ({
          ok: true,
          message: 'synced'
        }))
      },
      adminSettings: {
        getRemoteRiskPolicy: vi.fn(async () => ({
          mode: 'audit_only'
        })),
        saveRemoteRiskPolicy: vi.fn(async () => ({
          ok: true,
          message: 'saved',
          mode: 'audit_only'
        }))
      },
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    }

    render(
      <MemoryRouter initialEntries={['/admin/device-config']}>
        <AdminDeviceConfigPage />
      </MemoryRouter>
    )

    await screen.findByText('Mode 0 — Off')
    await screen.findByText('Mode 1 — Manual')
    await screen.findByText('Mode 2 — Auto')
    await screen.findByText('Mode 3 — Manual + Auto')
    await screen.findByText('Mode 4 — Manual Fixed')
    await screen.findByText('Mode 5 — Fixed')
  })

  it('renders readback schedule times from statetimezone montime rows instead of falling back to defaults', async () => {
    window.ccpro = {
      admin: {
        getSession: vi.fn(async () => buildAdminSession()),
        login: undefined as never,
        logout: vi.fn(async () => undefined),
        bootstrap: undefined as never
      },
      adminUsers: undefined as never,
      machineConfig: {
        getConfig: vi.fn(async () => ({
          stateMode: 2,
          schedule: [
            {
              stateKey: JSON.stringify({ statecode: '0', funcname: 'state0' }),
              stateList: JSON.stringify({ funcname: 'state0', statetimezonename: 'TimeZone841066104' }),
              stateTimezone: JSON.stringify({ statetimezonename: 'TimeZone841066104', montime: '700' })
            },
            {
              stateKey: JSON.stringify({ statecode: '2', funcname: 'state2' }),
              stateList: JSON.stringify({ funcname: 'state2', statetimezonename: 'time3' }),
              stateTimezone: JSON.stringify({ statetimezonename: 'time3', montime: '1130' })
            },
            {
              stateKey: JSON.stringify({ statecode: '3', funcname: 'state3' }),
              stateList: JSON.stringify({ funcname: 'state3', statetimezonename: 'time4' }),
              stateTimezone: JSON.stringify({ statetimezonename: 'time4', montime: '1300' })
            },
            {
              stateKey: JSON.stringify({ statecode: '1', funcname: 'state1' }),
              stateList: JSON.stringify({ funcname: 'state1', statetimezonename: 'TimeZone841068205' }),
              stateTimezone: JSON.stringify({ statetimezonename: 'TimeZone841068205', montime: '1730' })
            }
          ]
        })),
        saveConfig: vi.fn(async () => ({
          ok: true,
          message: 'saved'
        })),
        syncTime: vi.fn(async () => ({
          ok: true,
          message: 'synced'
        }))
      },
      adminSettings: {
        getRemoteRiskPolicy: vi.fn(async () => ({
          mode: 'audit_only'
        })),
        saveRemoteRiskPolicy: vi.fn(async () => ({
          ok: true,
          message: 'saved',
          mode: 'audit_only'
        }))
      },
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    }

    const { container } = render(
      <MemoryRouter initialEntries={['/admin/device-config']}>
        <AdminDeviceConfigPage />
      </MemoryRouter>
    )

    await screen.findByText('Mode 2 — Auto')

    const timeInputs = Array.from(container.querySelectorAll('input[type="time"]')) as HTMLInputElement[]
    expect(timeInputs.map((input) => input.value)).toEqual(['07:00', '11:30', '13:00', '17:30'])
  })

  it('loads the remote-risk policy and saves the updated toggle through admin settings IPC', async () => {
    const saveRemoteRiskPolicy = vi.fn(async () => ({
      ok: true,
      message: 'Đã lưu cấu hình chặn điều khiển từ xa',
      mode: 'block_high_risk'
    }))

    window.ccpro = {
      admin: {
        getSession: vi.fn(async () => buildAdminSession()),
        login: undefined as never,
        logout: vi.fn(async () => undefined),
        bootstrap: undefined as never
      },
      adminUsers: undefined as never,
      machineConfig: {
        getConfig: vi.fn(async () => ({
          stateMode: 2,
          schedule: []
        })),
        saveConfig: vi.fn(async () => ({
          ok: true,
          message: 'saved'
        })),
        syncTime: vi.fn(async () => ({
          ok: true,
          message: 'synced'
        }))
      },
      adminSettings: {
        getRemoteRiskPolicy: vi.fn(async () => ({
          mode: 'audit_only'
        })),
        saveRemoteRiskPolicy
      },
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    }

    render(
      <MemoryRouter initialEntries={['/admin/device-config']}>
        <AdminDeviceConfigPage />
      </MemoryRouter>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Bảo mật' }))

    const toggle = await screen.findByRole('checkbox', {
      name: 'Chặn chấm công khi phát hiện điều khiển từ xa'
    })
    expect(toggle).not.toBeChecked()

    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách bảo mật' }))

    await waitFor(() => {
      expect(saveRemoteRiskPolicy).toHaveBeenCalledWith({ mode: 'block_high_risk' })
    })
  })

  it('falls back safely when the preload bridge does not expose adminSettings yet', async () => {
    window.ccpro = {
      admin: {
        getSession: vi.fn(async () => buildAdminSession()),
        login: undefined as never,
        logout: vi.fn(async () => undefined),
        bootstrap: undefined as never
      },
      adminUsers: undefined as never,
      machineConfig: {
        getConfig: vi.fn(async () => ({
          stateMode: 2,
          schedule: []
        })),
        saveConfig: vi.fn(async () => ({
          ok: true,
          message: 'saved'
        })),
        syncTime: vi.fn(async () => ({
          ok: true,
          message: 'synced'
        }))
      },
      auth: undefined as never,
      attendance: undefined as never,
      notifications: undefined as never,
      settings: undefined as never,
      deviceSync: undefined as never
    } as typeof window.ccpro

    render(
      <MemoryRouter initialEntries={['/admin/device-config']}>
        <AdminDeviceConfigPage />
      </MemoryRouter>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Bảo mật' }))

    expect(
      await screen.findByRole('checkbox', {
        name: 'Chặn chấm công khi phát hiện điều khiển từ xa'
      })
    ).not.toBeChecked()
    expect(
      screen.getByText('Bản app hiện tại chưa hỗ trợ đồng bộ chính sách bảo mật. Hãy mở lại app sau khi cập nhật build mới.')
    ).toBeInTheDocument()
  })
})
