import { beforeEach, describe, expect, it, vi } from 'vitest'

const execFileMock = vi.fn()
const requestMock = {
  input: vi.fn().mockReturnThis(),
  query: vi.fn(async () => undefined)
}
const poolMock = {
  request: vi.fn(() => requestMock)
}

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFile: execFileMock,
    default: {
      ...(actual as unknown as { default?: object }).default,
      execFile: execFileMock
    }
  }
})

vi.mock('../../db/sql', () => ({
  getPool: vi.fn(async () => poolMock)
}))

const jsonStdout = (value: unknown): { stdout: string; stderr: string } => ({
  stdout: JSON.stringify(value),
  stderr: ''
})

describe('ZkMachineConfigService', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    execFileMock.mockImplementation((
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void
    ) => {
      callback(new Error('unexpected execFile call'))
    })
    poolMock.request.mockClear()
    requestMock.input.mockClear()
    requestMock.query.mockClear()
    process.env.CCPRO_MACHINE_CONFIG_HELPER_PATH = 'C:\\tools\\machine-config-helper.exe'
  })

  it('loads config through the packaged helper executable', async () => {
    execFileMock.mockImplementationOnce((
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
    ) => {
      callback(null, jsonStdout({
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
      }))
    })

    const { ZkMachineConfigService } = await import('../machine-config-service')
    const service = new ZkMachineConfigService({
      deviceIp: '10.60.1.5',
      devicePort: 4370,
      devicePassword: 938948
    })

    const result = await service.getConfig()

    expect(result.stateMode).toBe(2)
    expect(result.schedule).toHaveLength(4)
    expect(execFileMock).toHaveBeenCalledTimes(1)
    expect(execFileMock).toHaveBeenCalledWith(
      'C:\\tools\\machine-config-helper.exe',
      [
        'get-config',
        '--ip', '10.60.1.5',
        '--port', '4370',
        '--password', '938948'
      ],
      expect.objectContaining({
        timeout: 30_000
      }),
      expect.any(Function)
    )
  })

  it('saves config through the packaged helper executable and writes an audit row', async () => {
    const before = {
      stateMode: 2,
      schedule: [
        {
          stateKey: JSON.stringify({ statecode: '0', funcname: 'state0' }),
          stateList: JSON.stringify({ funcname: 'state0', statetimezonename: 'TimeZone841066104' }),
          stateTimezone: JSON.stringify({ statetimezonename: 'TimeZone841066104', montime: '700' })
        }
      ]
    }

    const after = {
      stateMode: 3,
      schedule: [
        {
          stateKey: JSON.stringify({ statecode: '0', funcname: 'state0' }),
          stateList: JSON.stringify({ funcname: 'state0', statetimezonename: 'TimeZone841066104' }),
          stateTimezone: JSON.stringify({ statetimezonename: 'TimeZone841066104', montime: '730' })
        }
      ]
    }

    execFileMock.mockImplementationOnce((
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
    ) => {
      callback(null, jsonStdout({
        ok: true,
        message: 'saved',
        before,
        after
      }))
    })

    const { ZkMachineConfigService } = await import('../machine-config-service')
    const service = new ZkMachineConfigService({
      deviceIp: '10.60.1.5',
      devicePort: 4370,
      devicePassword: 938948
    })

    const result = await service.saveConfig(
      {
        stateMode: 3,
        schedule: after.schedule
      },
      7
    )

    expect(result).toEqual({
      ok: true,
      message: 'saved',
      before,
      after
    })
    expect(execFileMock).toHaveBeenCalledTimes(1)
    const helperArgs = execFileMock.mock.calls[0]?.[1] as string[]
    const payloadIndex = helperArgs.indexOf('--payloadB64')
    const payload = JSON.parse(Buffer.from(helperArgs[payloadIndex + 1] ?? '', 'base64').toString('utf8'))
    expect(helperArgs.slice(0, 7)).toEqual([
      'save-config',
      '--ip', '10.60.1.5',
      '--port', '4370',
      '--password', '938948'
    ])
    expect(payload).toEqual({
      stateMode: 3,
      schedule: after.schedule
    })
    expect(poolMock.request).toHaveBeenCalledTimes(1)
    expect(requestMock.query).toHaveBeenCalledTimes(1)
  })

  it('allows a longer helper timeout for save-config readback verification', async () => {
    execFileMock.mockImplementationOnce((
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
    ) => {
      callback(null, jsonStdout({
        ok: true,
        message: 'saved',
        before: { stateMode: 2, schedule: [] },
        after: { stateMode: 2, schedule: [] }
      }))
    })

    const { ZkMachineConfigService } = await import('../machine-config-service')
    const service = new ZkMachineConfigService({
      deviceIp: '10.60.1.5',
      devicePort: 4370,
      devicePassword: 938948
    })

    await service.saveConfig({ stateMode: 2, schedule: [] }, 7)

    expect(execFileMock).toHaveBeenCalledWith(
      'C:\\tools\\machine-config-helper.exe',
      expect.arrayContaining(['save-config']),
      expect.objectContaining({
        timeout: 120_000
      }),
      expect.any(Function)
    )
  })

  it('returns the helper JSON error message instead of only the execFile command string', async () => {
    const helperError = Object.assign(new Error('Command failed: machine-config-helper.exe save-config ...'), {
      stdout: JSON.stringify({
        ok: false,
        message: 'Readback không khớp hoàn toàn với cấu hình yêu cầu'
      }),
      stderr: ''
    })

    execFileMock.mockImplementationOnce((
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void
    ) => {
      callback(helperError)
    })

    const { ZkMachineConfigService } = await import('../machine-config-service')
    const service = new ZkMachineConfigService({
      deviceIp: '10.60.1.5',
      devicePort: 4370,
      devicePassword: 938948
    })

    const result = await service.saveConfig(
      {
        stateMode: 2,
        schedule: []
      },
      7
    )

    expect(result).toEqual({
      ok: false,
      message: 'Lưu cấu hình thất bại: Readback không khớp hoàn toàn với cấu hình yêu cầu'
    })
    expect(requestMock.query).toHaveBeenCalledTimes(1)
  })
})
