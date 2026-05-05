import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createHardwareIdProvider } from '../hardware-id'

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

describe('createHardwareIdProvider', () => {
  it('returns a SHA-256 hex hardware id from motherboard serial and MAC address', async () => {
    const runPowerShell = vi.fn(async (command: string) => {
      if (command.includes('Win32_BaseBoard')) return 'BOARD-123'
      if (command.includes('Get-NetAdapter')) return 'AA-BB-CC-DD-EE-FF'
      if (command.includes('MachineGuid')) return 'MACHINE-GUID'
      return ''
    })

    const provider = createHardwareIdProvider(runPowerShell)

    await expect(provider.getHardwareId()).resolves.toBe(
      sha256('board-123|aa-bb-cc-dd-ee-ff')
    )
    await expect(provider.getHardwareId()).resolves.toMatch(/^[a-f0-9]{64}$/)
  })

  it('caches the generated hardware id for the current process', async () => {
    const runPowerShell = vi.fn(async (command: string) => {
      if (command.includes('Win32_BaseBoard')) return 'BOARD-123'
      if (command.includes('Get-NetAdapter')) return 'AA-BB-CC-DD-EE-FF'
      if (command.includes('MachineGuid')) return 'MACHINE-GUID'
      return ''
    })
    const provider = createHardwareIdProvider(runPowerShell)

    const first = await provider.getHardwareId()
    const callsAfterFirstRead = runPowerShell.mock.calls.length
    const second = await provider.getHardwareId()

    expect(second).toBe(first)
    expect(runPowerShell).toHaveBeenCalledTimes(callsAfterFirstRead)
  })

  it('falls back to Windows MachineGuid when motherboard serial is blank', async () => {
    const runPowerShell = vi.fn(async (command: string) => {
      if (command.includes('Win32_BaseBoard')) return '   '
      if (command.includes('Get-NetAdapter')) return 'AA-BB-CC-DD-EE-FF'
      if (command.includes('MachineGuid')) return 'MACHINE-GUID'
      return ''
    })

    const provider = createHardwareIdProvider(runPowerShell)

    await expect(provider.getHardwareId()).resolves.toBe(
      sha256('machine-guid|aa-bb-cc-dd-ee-ff')
    )
  })
})
