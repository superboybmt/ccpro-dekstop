import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { formatAppIsoOffset } from '@shared/app-time'

const execFile = promisify(execFileCallback)

export type RemoteRiskLevel = 'low' | 'medium' | 'high'
export type RemoteRiskPolicyMode = 'audit_only' | 'block_high_risk'

export interface RemoteProcessInfo {
  name: string
  pid: number
}

export interface RemoteNetworkConnection {
  pid: number
  state: string
  remoteAddress: string
}

export interface RemoteRiskState {
  level: RemoteRiskLevel
  blocking: boolean
  detectedProcesses: RemoteProcessInfo[]
  activeSignals: string[]
  checkedAt: string
  reason: string | null
}

export interface RemoteRiskDetector {
  listProcesses(): Promise<RemoteProcessInfo[]>
  listNetworkConnections(processIds: number[]): Promise<RemoteNetworkConnection[]>
  getForegroundProcess(): Promise<RemoteProcessInfo | null>
  isRemoteSessionActive(): Promise<boolean>
  hasVisibleWindow(processIds: number[]): Promise<boolean>
  hasActiveSessionWindow(processIds: number[]): Promise<boolean>
}

// ---------------------------------------------------------------------------
// Phase 01: Process Classification — Service vs Desktop
// ---------------------------------------------------------------------------

interface RemoteToolDefinition {
  name: string
  serviceProcesses: string[]
  desktopProcesses: string[]
  /** Regex patterns matched against window titles to detect active incoming sessions. */
  activeSessionTitlePatterns: RegExp[]
}

const REMOTE_TOOL_DEFINITIONS: readonly RemoteToolDefinition[] = [
  // ── Tier 1: Rất phổ biến tại Việt Nam ──────────────────────────────
  {
    name: 'UltraViewer',
    serviceProcesses: ['ultraviewer_service'],
    desktopProcesses: ['ultraviewer_desktop', 'ultraviewer'],
    activeSessionTitlePatterns: []
  },
  {
    name: 'TeamViewer',
    serviceProcesses: ['teamviewer_service'],
    desktopProcesses: ['teamviewer'],
    activeSessionTitlePatterns: []
  },
  {
    name: 'AnyDesk',
    // AnyDesk has NO separate service exe — it runs AnyDesk.exe --service under SYSTEM context
    serviceProcesses: [],
    desktopProcesses: ['anydesk'],
    activeSessionTitlePatterns: []
  },
  {
    name: 'RustDesk',
    serviceProcesses: [],
    desktopProcesses: ['rustdesk'],
    // Window title "<remote_id> - RustDesk" appears when an incoming session is active
    activeSessionTitlePatterns: [/^\d+ - RustDesk$/i]
  },
  {
    name: 'Chrome Remote Desktop',
    // remoting_host.exe — the CORE host process that accepts incoming connections (chromoting service)
    // remoting_desktop.exe — desktop integration and session management
    // remote_assistance_host.exe — attended remote support sessions
    // All classified as desktop because they ARE the remote control components
    serviceProcesses: [],
    desktopProcesses: ['remoting_host', 'remoting_desktop', 'remote_assistance_host'],
    activeSessionTitlePatterns: []
  },

  // ── Tier 2: Phổ biến quốc tế (Enterprise) ──────────────────────────
  {
    name: 'Splashtop',
    serviceProcesses: ['srupdate'],
    desktopProcesses: ['srservice', 'srserver'],
    activeSessionTitlePatterns: []
  },
  {
    name: 'LogMeIn',
    serviceProcesses: ['lmiguardiansvc'],
    desktopProcesses: ['logmein', 'logmeinsystray'],
    activeSessionTitlePatterns: []
  },
  {
    name: 'ConnectWise ScreenConnect',
    serviceProcesses: [],
    desktopProcesses: ['screenconnect.clientservice', 'screenconnect.windowsclient'],
    activeSessionTitlePatterns: []
  },
  {
    name: 'RemotePC',
    // RemotePCService is the host agent that accepts incoming connections
    serviceProcesses: [],
    desktopProcesses: ['remotepcservice'],
    activeSessionTitlePatterns: []
  },
  {
    name: 'Zoho Assist',
    // zaservice.exe is the unattended access agent
    serviceProcesses: [],
    desktopProcesses: ['zaservice'],
    activeSessionTitlePatterns: []
  },

  // ── Tier 3: VNC Family ──────────────────────────────────────────────
  // VNC servers are classified as desktopProcesses (NOT serviceProcesses)
  // because they ARE the component that allows remote screen sharing/control.
  // Classifying them as service would cause them to be skipped by detection.
  {
    name: 'RealVNC',
    serviceProcesses: [],
    desktopProcesses: ['vncserver'],
    activeSessionTitlePatterns: []
  },
  {
    name: 'TightVNC',
    serviceProcesses: [],
    desktopProcesses: ['tvnserver'],
    activeSessionTitlePatterns: []
  },
  {
    name: 'UltraVNC',
    serviceProcesses: [],
    desktopProcesses: ['winvnc'],
    activeSessionTitlePatterns: []
  },

  // ── Tier 4: Additional Remote Tools ─────────────────────────────────
  {
    name: 'Parsec',
    // parsecd.exe is the main app; pservice.exe is the SYSTEM-level background service
    // Parsec uses UDP streaming (like RustDesk) — TCP connection counting may undercount
    serviceProcesses: ['pservice'],
    desktopProcesses: ['parsecd'],
    activeSessionTitlePatterns: []
  },
  {
    name: 'Supremo',
    serviceProcesses: ['supremohelper'],
    desktopProcesses: ['supremo', 'supremoservice'],
    activeSessionTitlePatterns: []
  },
  {
    name: 'Ammyy Admin',
    // AA_v3.exe is the standard executable name; frequently abused by scammers
    serviceProcesses: [],
    desktopProcesses: ['aa_v3'],
    activeSessionTitlePatterns: []
  }
] as const

const normalizeProcessName = (value: string): string =>
  value.trim().toLowerCase().replace(/\.exe$/i, '')

const matchesCandidate = (normalized: string, candidate: string): boolean =>
  normalized === candidate || normalized.startsWith(`${candidate}_`)

const isDenylisted = (processName: string): boolean => {
  const normalized = normalizeProcessName(processName)
  return REMOTE_TOOL_DEFINITIONS.some(
    (tool) =>
      tool.serviceProcesses.some((c) => matchesCandidate(normalized, c)) ||
      tool.desktopProcesses.some((c) => matchesCandidate(normalized, c))
  )
}

const isServiceProcess = (processName: string): boolean => {
  const normalized = normalizeProcessName(processName)
  return REMOTE_TOOL_DEFINITIONS.some((tool) =>
    tool.serviceProcesses.some((c) => matchesCandidate(normalized, c))
  )
}

const isDesktopProcess = (processName: string): boolean => {
  // Service processes take priority — if it matches a service pattern, it is NOT desktop
  if (isServiceProcess(processName)) return false
  const normalized = normalizeProcessName(processName)
  return REMOTE_TOOL_DEFINITIONS.some((tool) =>
    tool.desktopProcesses.some((c) => matchesCandidate(normalized, c))
  )
}

// ---------------------------------------------------------------------------
// Phase 03: Risk Classification — 4-Tier Decision Matrix
// ---------------------------------------------------------------------------

const classifyRiskLevel = (activeSignals: string[]): RemoteRiskLevel => {
  // Tier 1: RDP / Terminal Services → immediate HIGH
  if (activeSignals.includes('remote-session')) return 'high'

  // Tier 1b: Window title proves active incoming session (e.g. RustDesk UDP-based tools)
  if (activeSignals.includes('active-session-window')) return 'high'

  // Foreground + network → HIGH (tool is in foreground AND connecting externally)
  if (activeSignals.includes('foreground') && activeSignals.includes('network')) return 'high'

  // Many concurrent connections from desktop process → HIGH
  // Heartbeat = 1-2 connections; active remote session = 3+ (screen + input + clipboard)
  if (activeSignals.includes('network-multi')) return 'high'

  // Desktop process has some signal but not enough for HIGH → MEDIUM (audit, no block)
  // This includes: network (1-2 relay heartbeat connections), foreground-only,
  // visible-window, or network-sustained (single persistent heartbeat)
  if (activeSignals.length > 0) return 'medium'

  // Everything else → LOW
  return 'low'
}

const classifyReason = (level: RemoteRiskLevel): string | null => {
  switch (level) {
    case 'high':
      return 'Phát hiện điều khiển từ xa đang hoạt động'
    case 'medium':
      return 'Phát hiện tín hiệu điều khiển từ xa đáng ngờ'
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// PowerShell Helpers
// ---------------------------------------------------------------------------

const parsePowerShellJson = <T>(stdout: string): T[] => {
  const trimmed = stdout.trim()
  if (!trimmed) return []
  const parsed = JSON.parse(trimmed) as T | T[]
  return Array.isArray(parsed) ? parsed : [parsed]
}

const runPowerShell = async (script: string): Promise<string> => {
  const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-Command', script], {
    windowsHide: true,
    timeout: 10_000
  })
  return stdout
}

const buildForegroundProcessScript = (): string => `
  $ErrorActionPreference="Stop"
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeMethods {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
  $hwnd = [NativeMethods]::GetForegroundWindow()
  if ($hwnd -eq [IntPtr]::Zero) { return }
  $foregroundPid = [uint32]0
  [void][NativeMethods]::GetWindowThreadProcessId($hwnd, [ref]$foregroundPid)
  if ($foregroundPid -le 0) { return }
  Get-Process -Id $foregroundPid | Select-Object Id, ProcessName | ConvertTo-Json -Compress
`

// Phase 02: Win32 EnumWindows probe for visible window detection
const buildVisibleWindowScript = (pids: number[]): string => {
  const pidArray = pids.join(',')
  return `
  $ErrorActionPreference="Stop"
  Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class WindowProbe {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] static extern int GetWindowTextLength(IntPtr hWnd);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  public static List<uint> GetVisibleWindowPids() {
    var pids = new List<uint>();
    EnumWindows((hWnd, _) => {
      if (IsWindowVisible(hWnd) && GetWindowTextLength(hWnd) > 0) {
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        if (pid > 0) pids.Add(pid);
      }
      return true;
    }, IntPtr.Zero);
    return pids;
  }
}
"@
  $targetPids = @(${pidArray})
  $visiblePids = [WindowProbe]::GetVisibleWindowPids()
  $hasVisible = ($targetPids | Where-Object { $visiblePids -contains $_ }).Count -gt 0
  ConvertTo-Json @{ hasVisible = $hasVisible } -Compress
`
}

// Phase 02b: EnumWindows with title extraction — detect active incoming sessions
// e.g. RustDesk shows "1279903594 - RustDesk" when a remote peer is connected
const buildActiveSessionWindowScript = (pids: number[]): string => {
  const pidArray = pids.join(',')
  return `
  $ErrorActionPreference="Stop"
  Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class SessionWindowProbe {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] static extern int GetWindowTextLength(IntPtr hWnd);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  public static List<string> GetWindowTitles(uint[] targetPids) {
    var titles = new List<string>();
    var targetSet = new HashSet<uint>(targetPids);
    EnumWindows((hWnd, _) => {
      if (IsWindowVisible(hWnd)) {
        int len = GetWindowTextLength(hWnd);
        if (len > 0) {
          uint pid;
          GetWindowThreadProcessId(hWnd, out pid);
          if (targetSet.Contains(pid)) {
            var sb = new StringBuilder(len + 1);
            GetWindowText(hWnd, sb, sb.Capacity);
            titles.Add(sb.ToString());
          }
        }
      }
      return true;
    }, IntPtr.Zero);
    return titles;
  }
}
"@
  $targetPids = @(${pidArray})
  $titles = [SessionWindowProbe]::GetWindowTitles($targetPids)
  ConvertTo-Json @{ titles = @($titles) } -Compress
`
}

// Phase 02: GetSystemMetrics(SM_REMOTESESSION) for Tier 1 RDP detection
const buildRemoteSessionScript = (): string => `
  $ErrorActionPreference="Stop"
  Add-Type @"
using System.Runtime.InteropServices;
public static class SessionProbe {
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
  public static bool IsRemoteSession() { return GetSystemMetrics(0x1000) != 0; }
}
"@
  $isRemote = [SessionProbe]::IsRemoteSession()
  ConvertTo-Json @{ isRemote = $isRemote } -Compress
`

// ---------------------------------------------------------------------------
// Windows Detector Implementation
// ---------------------------------------------------------------------------

export class WindowsRemoteRiskDetector implements RemoteRiskDetector {
  async listProcesses(): Promise<RemoteProcessInfo[]> {
    try {
      const stdout = await runPowerShell(
        '$ErrorActionPreference="Stop"; Get-Process | Select-Object Id, ProcessName | ConvertTo-Json -Compress'
      )

      return parsePowerShellJson<{ Id?: number; ProcessName?: string }>(stdout)
        .filter((row) => typeof row.Id === 'number' && typeof row.ProcessName === 'string')
        .map((row) => ({
          pid: row.Id as number,
          name: `${row.ProcessName as string}.exe`
        }))
    } catch {
      return []
    }
  }

  async listNetworkConnections(processIds: number[]): Promise<RemoteNetworkConnection[]> {
    if (processIds.length === 0) return []

    try {
      const filter = processIds.map((pid) => `$_\.OwningProcess -eq ${pid}`).join(' -or ')
      const stdout = await runPowerShell(
        `$ErrorActionPreference="Stop"; Get-NetTCPConnection -State Established | Where-Object { ${filter} } | Select-Object OwningProcess, State, RemoteAddress | ConvertTo-Json -Compress`
      )

      return parsePowerShellJson<{ OwningProcess?: number; State?: string; RemoteAddress?: string }>(stdout)
        .filter((row) => typeof row.OwningProcess === 'number')
        .map((row) => ({
          pid: row.OwningProcess as number,
          state: row.State ?? 'Unknown',
          remoteAddress: row.RemoteAddress ?? ''
        }))
    } catch {
      return []
    }
  }

  async getForegroundProcess(): Promise<RemoteProcessInfo | null> {
    try {
      const stdout = await runPowerShell(buildForegroundProcessScript())
      const rows = parsePowerShellJson<{ Id?: number; ProcessName?: string }>(stdout)
      const row = rows[0]
      if (!row || typeof row.Id !== 'number' || typeof row.ProcessName !== 'string') return null

      return {
        pid: row.Id,
        name: `${row.ProcessName}.exe`
      }
    } catch {
      return null
    }
  }

  async isRemoteSessionActive(): Promise<boolean> {
    // Check SESSIONNAME env var (fast, no PowerShell needed)
    const sessionName = process.env.SESSIONNAME?.trim().toUpperCase() ?? ''
    if (sessionName.startsWith('RDP-')) return true

    // Tier 1: GetSystemMetrics(SM_REMOTESESSION) — detects RDP/TS reliably
    try {
      const stdout = await runPowerShell(buildRemoteSessionScript())
      const parsed = parsePowerShellJson<{ isRemote?: boolean }>(stdout)
      return parsed[0]?.isRemote === true
    } catch {
      return false
    }
  }

  async hasVisibleWindow(processIds: number[]): Promise<boolean> {
    if (processIds.length === 0) return false

    try {
      const stdout = await runPowerShell(buildVisibleWindowScript(processIds))
      const parsed = parsePowerShellJson<{ hasVisible?: boolean }>(stdout)
      return parsed[0]?.hasVisible === true
    } catch {
      return false
    }
  }

  async hasActiveSessionWindow(processIds: number[]): Promise<boolean> {
    if (processIds.length === 0) return false

    try {
      const stdout = await runPowerShell(buildActiveSessionWindowScript(processIds))
      const parsed = parsePowerShellJson<{ titles?: string[] }>(stdout)
      const titles = parsed[0]?.titles ?? []

      return titles.some((title) =>
        REMOTE_TOOL_DEFINITIONS.some((tool) =>
          tool.activeSessionTitlePatterns.some((pattern) => pattern.test(title))
        )
      )
    } catch {
      return false
    }
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface RemoteRiskServiceOptions {
  detector?: RemoteRiskDetector
  now?: () => Date
}

export class RemoteRiskService {
  static readonly NETWORK_HIGH_RISK_THRESHOLD_MS = 15_000

  private readonly detector: RemoteRiskDetector
  private readonly now: () => Date
  private readonly networkSeenSinceByPid = new Map<number, number>()

  constructor(options?: RemoteRiskServiceOptions) {
    this.detector = options?.detector ?? new WindowsRemoteRiskDetector()
    this.now = options?.now ?? (() => new Date())
  }

  async evaluate(): Promise<RemoteRiskState> {
    const checkedAt = this.now()
    const [processes, foregroundProcess, remoteSessionActive] = await Promise.all([
      this.detector.listProcesses(),
      this.detector.getForegroundProcess(),
      this.detector.isRemoteSessionActive()
    ])

    // Phase 01: Separate detected processes into service vs desktop
    const detectedProcesses = processes.filter((p) => isDenylisted(p.name))
    const desktopProcesses = detectedProcesses.filter((p) => isDesktopProcess(p.name))
    const serviceOnlyProcesses = detectedProcesses.filter(
      (p) => isServiceProcess(p.name) && !isDesktopProcess(p.name)
    )

    // Tier 1: RDP check — no process detection needed
    if (remoteSessionActive) {
      return {
        level: 'high',
        blocking: true,
        detectedProcesses,
        activeSignals: ['remote-session'],
        checkedAt: formatAppIsoOffset(checkedAt),
        reason: classifyReason('high')
      }
    }

    // If ONLY service processes detected (no desktop/GUI) → LOW immediately
    if (detectedProcesses.length > 0 && desktopProcesses.length === 0) {
      return {
        level: 'low',
        blocking: false,
        detectedProcesses: serviceOnlyProcesses,
        activeSignals: [],
        checkedAt: formatAppIsoOffset(checkedAt),
        reason: null
      }
    }

    // No remote processes at all → LOW
    if (detectedProcesses.length === 0) {
      return {
        level: 'low',
        blocking: false,
        detectedProcesses: [],
        activeSignals: [],
        checkedAt: formatAppIsoOffset(checkedAt),
        reason: null
      }
    }

    // Phase 01: Only check network for DESKTOP process PIDs (skip service heartbeats)
    const desktopPids = desktopProcesses.map((p) => p.pid)
    const [networkConnections, hasVisibleWindow, hasActiveSession] = await Promise.all([
      this.detector.listNetworkConnections(desktopPids),
      this.detector.hasVisibleWindow(desktopPids),
      this.detector.hasActiveSessionWindow(desktopPids)
    ])

    const activeSignals: string[] = []
    const nowMs = checkedAt.getTime()
    const activeNetworkPids = new Set(networkConnections.map((c) => c.pid))

    if (networkConnections.length > 0) {
      activeSignals.push('network')
    }

    // Count connections per PID — active remote session uses 2+ connections
    const connectionCountByPid = new Map<number, number>()
    for (const c of networkConnections) {
      connectionCountByPid.set(c.pid, (connectionCountByPid.get(c.pid) ?? 0) + 1)
    }
    // Idle heartbeat uses 1 connection. Active remote session uses 2 (control + data stream)
    const ACTIVE_SESSION_CONNECTION_THRESHOLD = 2
    if ([...connectionCountByPid.values()].some((count) => count >= ACTIVE_SESSION_CONNECTION_THRESHOLD)) {
      activeSignals.push('network-multi')
    }

    // Track sustained network connections
    for (const pid of activeNetworkPids) {
      if (!this.networkSeenSinceByPid.has(pid)) {
        this.networkSeenSinceByPid.set(pid, nowMs)
      }
    }
    for (const trackedPid of [...this.networkSeenSinceByPid.keys()]) {
      if (!activeNetworkPids.has(trackedPid)) {
        this.networkSeenSinceByPid.delete(trackedPid)
      }
    }
    if (
      networkConnections.some((c) => {
        const seenSince = this.networkSeenSinceByPid.get(c.pid)
        return typeof seenSince === 'number' && nowMs - seenSince >= RemoteRiskService.NETWORK_HIGH_RISK_THRESHOLD_MS
      })
    ) {
      activeSignals.push('network-sustained')
    }

    // Foreground check
    if (foregroundProcess && desktopPids.includes(foregroundProcess.pid)) {
      activeSignals.push('foreground')
    }

    // Phase 02: Window visibility signal
    if (hasVisibleWindow) {
      activeSignals.push('visible-window')
    }

    // Phase 02b: Active session window (e.g. RustDesk "<id> - RustDesk" title)
    if (hasActiveSession) {
      activeSignals.push('active-session-window')
    }

    const level = classifyRiskLevel(activeSignals)

    return {
      level,
      blocking: level === 'high',
      detectedProcesses,
      activeSignals,
      checkedAt: formatAppIsoOffset(checkedAt),
      reason: classifyReason(level)
    }
  }
}

export const remoteRiskConfig = {
  denylist: REMOTE_TOOL_DEFINITIONS,
  classifyRiskLevel
}

export const __internal = {
  buildForegroundProcessScript,
  buildVisibleWindowScript,
  buildActiveSessionWindowScript,
  buildRemoteSessionScript,
  isDenylisted,
  isServiceProcess,
  isDesktopProcess,
  classifyRiskLevel
}
