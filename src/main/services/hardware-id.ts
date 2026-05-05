import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

const BASEBOARD_SERIAL_COMMAND =
  "(Get-CimInstance Win32_BaseBoard | Select-Object -ExpandProperty SerialNumber | Select-Object -First 1)"
const PRIMARY_MAC_COMMAND =
  "(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.MacAddress } | Sort-Object ifIndex | Select-Object -ExpandProperty MacAddress | Select-Object -First 1)"
const MACHINE_GUID_COMMAND =
  "(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid).MachineGuid"

export interface HardwareIdProvider {
  getHardwareId(): Promise<string>
}

type PowerShellRunner = (command: string) => Promise<string>

const normalizeIdentifierPart = (value: string): string => value.trim().toLowerCase()

const hashHardwareFingerprint = (value: string): string =>
  createHash('sha256').update(value).digest('hex')

const runPowerShellCommand = async (command: string): Promise<string> => {
  const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-Command', command], {
    windowsHide: true,
    timeout: 15_000
  })

  return stdout.trim()
}

export const createHardwareIdProvider = (
  runPowerShell: PowerShellRunner = runPowerShellCommand
): HardwareIdProvider => {
  let cachedHardwareId: string | null = null
  let pendingHardwareId: Promise<string> | null = null

  return {
    async getHardwareId(): Promise<string> {
      if (cachedHardwareId) {
        return cachedHardwareId
      }

      if (!pendingHardwareId) {
        pendingHardwareId = (async () => {
          const motherboardSerial = normalizeIdentifierPart(await runPowerShell(BASEBOARD_SERIAL_COMMAND))
          const primaryMacAddress = normalizeIdentifierPart(await runPowerShell(PRIMARY_MAC_COMMAND))
          const machineGuid = normalizeIdentifierPart(await runPowerShell(MACHINE_GUID_COMMAND))

          const hardwareSource = motherboardSerial || machineGuid
          if (!hardwareSource || !primaryMacAddress) {
            throw new Error('Unable to determine hardware fingerprint for this machine')
          }

          const hardwareId = hashHardwareFingerprint(`${hardwareSource}|${primaryMacAddress}`)
          cachedHardwareId = hardwareId
          return hardwareId
        })().finally(() => {
          pendingHardwareId = null
        })
      }

      return pendingHardwareId
    }
  }
}

export const hardwareIdProvider = createHardwareIdProvider()

export const getHardwareId = (): Promise<string> => hardwareIdProvider.getHardwareId()

export const __internal = {
  BASEBOARD_SERIAL_COMMAND,
  PRIMARY_MAC_COMMAND,
  MACHINE_GUID_COMMAND,
  normalizeIdentifierPart,
  hashHardwareFingerprint,
  runPowerShellCommand
}
