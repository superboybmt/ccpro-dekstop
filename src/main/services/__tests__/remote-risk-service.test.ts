import { describe, expect, it } from 'vitest'
import {
  __internal,
  RemoteRiskService,
  type RemoteRiskDetector
} from '../remote-risk-service'

// ---------------------------------------------------------------------------
// Helper: build a mock detector with sensible defaults
// ---------------------------------------------------------------------------

const createMockDetector = (
  overrides: Partial<RemoteRiskDetector> = {}
): RemoteRiskDetector => ({
  listProcesses: async () => [],
  listNetworkConnections: async () => [],
  getForegroundProcess: async () => null,
  isRemoteSessionActive: async () => false,
  hasVisibleWindow: async () => false,
  hasActiveSessionWindow: async () => false,
  ...overrides
})

// ---------------------------------------------------------------------------
// Phase 01: Process Classification Unit Tests
// ---------------------------------------------------------------------------

describe('Process Classification', () => {
  it('classifies UltraViewer_Service as service process', () => {
    expect(__internal.isServiceProcess('UltraViewer_Service.exe')).toBe(true)
    expect(__internal.isDesktopProcess('UltraViewer_Service.exe')).toBe(false)
  })

  it('classifies UltraViewer_Desktop as desktop process', () => {
    expect(__internal.isDesktopProcess('UltraViewer_Desktop.exe')).toBe(true)
    expect(__internal.isServiceProcess('UltraViewer_Desktop.exe')).toBe(false)
  })

  it('classifies bare UltraViewer as desktop process', () => {
    expect(__internal.isDesktopProcess('UltraViewer.exe')).toBe(true)
    expect(__internal.isServiceProcess('UltraViewer.exe')).toBe(false)
  })

  it('classifies TeamViewer_Service as service, TeamViewer as desktop', () => {
    expect(__internal.isServiceProcess('TeamViewer_Service.exe')).toBe(true)
    expect(__internal.isDesktopProcess('TeamViewer.exe')).toBe(true)
  })

  it('treats all classified processes as denylisted', () => {
    // Tier 1: Vietnam popular
    expect(__internal.isDenylisted('UltraViewer_Service.exe')).toBe(true)
    expect(__internal.isDenylisted('UltraViewer_Desktop.exe')).toBe(true)
    expect(__internal.isDenylisted('TeamViewer.exe')).toBe(true)
    expect(__internal.isDenylisted('RustDesk.exe')).toBe(true)
    expect(__internal.isDenylisted('AnyDesk.exe')).toBe(true)
    expect(__internal.isDenylisted('remoting_host.exe')).toBe(true)
    expect(__internal.isDenylisted('remoting_desktop.exe')).toBe(true)
    expect(__internal.isDenylisted('remote_assistance_host.exe')).toBe(true)

    // Tier 2: Enterprise
    expect(__internal.isDenylisted('SRService.exe')).toBe(true)
    expect(__internal.isDenylisted('LogMeIn.exe')).toBe(true)
    expect(__internal.isDenylisted('ScreenConnect.ClientService.exe')).toBe(true)
    expect(__internal.isDenylisted('RemotePCService.exe')).toBe(true)
    expect(__internal.isDenylisted('zaservice.exe')).toBe(true)

    // Tier 3: VNC family
    expect(__internal.isDenylisted('vncserver.exe')).toBe(true)
    expect(__internal.isDenylisted('tvnserver.exe')).toBe(true)
    expect(__internal.isDenylisted('winvnc.exe')).toBe(true)

    // Tier 4: Additional
    expect(__internal.isDenylisted('parsecd.exe')).toBe(true)
    expect(__internal.isDenylisted('pservice.exe')).toBe(true)
    expect(__internal.isDenylisted('Supremo.exe')).toBe(true)
    expect(__internal.isDenylisted('AA_v3.exe')).toBe(true)

    // Not remote
    expect(__internal.isDenylisted('chrome.exe')).toBe(false)
  })

  // ===== Chrome Remote Desktop =====
  it('classifies Chrome Remote Desktop as desktop processes', () => {
    expect(__internal.isDesktopProcess('remoting_host.exe')).toBe(true)
    expect(__internal.isDesktopProcess('remoting_desktop.exe')).toBe(true)
    expect(__internal.isDesktopProcess('remote_assistance_host.exe')).toBe(true)
    expect(__internal.isServiceProcess('remoting_host.exe')).toBe(false)
  })

  // ===== NEW TOOLS: VNC servers =====
  it('classifies VNC servers as desktop (not service) for proper detection', () => {
    // VNC servers are the actual remote control component
    expect(__internal.isDesktopProcess('vncserver.exe')).toBe(true)
    expect(__internal.isDesktopProcess('tvnserver.exe')).toBe(true)
    expect(__internal.isDesktopProcess('winvnc.exe')).toBe(true)

    // Must NOT be service (would be skipped)
    expect(__internal.isServiceProcess('vncserver.exe')).toBe(false)
    expect(__internal.isServiceProcess('tvnserver.exe')).toBe(false)
    expect(__internal.isServiceProcess('winvnc.exe')).toBe(false)
  })

  // ===== Enterprise =====
  it('classifies enterprise remote tools correctly', () => {
    // Splashtop
    expect(__internal.isDesktopProcess('SRService.exe')).toBe(true)
    expect(__internal.isServiceProcess('SRUpdate.exe')).toBe(true)

    // LogMeIn
    expect(__internal.isDesktopProcess('LogMeIn.exe')).toBe(true)
    expect(__internal.isServiceProcess('LMIGuardianSvc.exe')).toBe(true)

    // ConnectWise ScreenConnect
    expect(__internal.isDesktopProcess('ScreenConnect.ClientService.exe')).toBe(true)
    expect(__internal.isDesktopProcess('ScreenConnect.WindowsClient.exe')).toBe(true)

    // RemotePC
    expect(__internal.isDesktopProcess('RemotePCService.exe')).toBe(true)

    // Zoho Assist
    expect(__internal.isDesktopProcess('zaservice.exe')).toBe(true)
  })

  // ===== Tier 4: Additional =====
  it('classifies Parsec, Supremo, Ammyy Admin correctly', () => {
    // Parsec
    expect(__internal.isDesktopProcess('parsecd.exe')).toBe(true)
    expect(__internal.isServiceProcess('pservice.exe')).toBe(true)

    // Supremo
    expect(__internal.isDesktopProcess('Supremo.exe')).toBe(true)
    expect(__internal.isDesktopProcess('SupremoService.exe')).toBe(true)
    expect(__internal.isServiceProcess('SupremoHelper.exe')).toBe(true)

    // Ammyy Admin
    expect(__internal.isDesktopProcess('AA_v3.exe')).toBe(true)
  })

  // ===== AnyDesk: no separate service exe =====
  it('classifies AnyDesk as desktop-only (no separate service exe exists)', () => {
    expect(__internal.isDesktopProcess('AnyDesk.exe')).toBe(true)
    // AnyDesk runs same exe with --service flag, so there is NO anydesk_service.exe
    expect(__internal.isServiceProcess('AnyDesk.exe')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Phase 03: Risk Classification Unit Tests
// ---------------------------------------------------------------------------

describe('classifyRiskLevel', () => {
  it('returns high for remote-session', () => {
    expect(__internal.classifyRiskLevel(['remote-session'])).toBe('high')
  })

  it('returns high for foreground + network', () => {
    expect(__internal.classifyRiskLevel(['foreground', 'network'])).toBe('high')
  })

  it('returns high for network-multi (3+ connections)', () => {
    expect(__internal.classifyRiskLevel(['network', 'network-multi'])).toBe('high')
  })

  it('returns medium for visible-window + network (not enough for HIGH)', () => {
    expect(__internal.classifyRiskLevel(['visible-window', 'network'])).toBe('medium')
  })

  it('returns medium for network-sustained alone (heartbeat)', () => {
    expect(__internal.classifyRiskLevel(['network', 'network-sustained'])).toBe('medium')
  })

  it('returns medium for visible-window only', () => {
    expect(__internal.classifyRiskLevel(['visible-window'])).toBe('medium')
  })

  it('returns medium for network only', () => {
    expect(__internal.classifyRiskLevel(['network'])).toBe('medium')
  })

  it('returns medium for foreground only', () => {
    expect(__internal.classifyRiskLevel(['foreground'])).toBe('medium')
  })

  it('returns high for active-session-window (RustDesk UDP bypass fix)', () => {
    expect(__internal.classifyRiskLevel(['active-session-window'])).toBe('high')
  })

  it('returns high for active-session-window + network', () => {
    expect(__internal.classifyRiskLevel(['network', 'active-session-window'])).toBe('high')
  })

  it('returns low for no signals', () => {
    expect(__internal.classifyRiskLevel([])).toBe('low')
  })
})

// ---------------------------------------------------------------------------
// Integration Tests: RemoteRiskService.evaluate()
// ---------------------------------------------------------------------------

describe('RemoteRiskService', () => {
  // ===== THE KEY FALSE-POSITIVE FIX =====
  it('returns LOW when only service processes are running (even with heartbeat network)', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'UltraViewer_Service.exe', pid: 100 }
        ]
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('low')
    expect(result.blocking).toBe(false)
    expect(result.activeSignals).toEqual([])
    // Service processes are still reported so the UI can show them
    expect(result.detectedProcesses).toHaveLength(1)
  })

  it('returns LOW when service + desktop are running but desktop has no signals', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'UltraViewer_Service.exe', pid: 100 },
          { name: 'UltraViewer_Desktop.exe', pid: 200 }
        ],
        listNetworkConnections: async () => [],
        hasVisibleWindow: async () => false
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('low')
    expect(result.blocking).toBe(false)
  })

  it('returns MEDIUM when desktop process has visible window but no network', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'UltraViewer_Desktop.exe', pid: 200 }
        ],
        listNetworkConnections: async () => [],
        hasVisibleWindow: async () => true
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('medium')
    expect(result.blocking).toBe(false)
    expect(result.activeSignals).toContain('visible-window')
  })

  it('returns MEDIUM when desktop has visible window + single network connection', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'UltraViewer_Desktop.exe', pid: 200 }
        ],
        listNetworkConnections: async () => [
          { pid: 200, state: 'Established', remoteAddress: '42.96.32.170' }
        ],
        hasVisibleWindow: async () => true
      })
    })

    const result = await service.evaluate()
    // Single relay connection + visible window = MEDIUM (not HIGH)
    expect(result.level).toBe('medium')
    expect(result.blocking).toBe(false)
  })

  it('returns HIGH when desktop process has 2+ connections (active session)', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'UltraViewer_Desktop.exe', pid: 200 }
        ],
        listNetworkConnections: async () => [
          { pid: 200, state: 'Established', remoteAddress: '42.96.32.170' },
          { pid: 200, state: 'Established', remoteAddress: '42.96.32.171' }
        ],
        hasVisibleWindow: async () => true
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('high')
    expect(result.blocking).toBe(true)
    expect(result.activeSignals).toContain('network-multi')
  })

  it('returns HIGH for RDP remote session regardless of processes', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'TeamViewer.exe', pid: 300 }
        ],
        isRemoteSessionActive: async () => true
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('high')
    expect(result.blocking).toBe(true)
    expect(result.activeSignals).toContain('remote-session')
  })

  it('returns HIGH for foreground + network combo', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'RustDesk.exe', pid: 303 }
        ],
        listNetworkConnections: async () => [
          { pid: 303, state: 'Established', remoteAddress: '52.0.0.1' }
        ],
        getForegroundProcess: async () => ({
          name: 'RustDesk.exe',
          pid: 303
        }),
        hasVisibleWindow: async () => true
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('high')
    expect(result.blocking).toBe(true)
  })

  it('returns MEDIUM when desktop has network but no visible window', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'AnyDesk.exe', pid: 400 }
        ],
        listNetworkConnections: async () => [
          { pid: 400, state: 'Established', remoteAddress: '52.0.0.1' }
        ],
        hasVisibleWindow: async () => false
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('medium')
    expect(result.blocking).toBe(false)
    expect(result.activeSignals).toContain('network')
    expect(result.activeSignals).not.toContain('visible-window')
  })

  it('returns LOW when no remote processes are detected', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'chrome.exe', pid: 500 },
          { name: 'explorer.exe', pid: 501 }
        ]
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('low')
    expect(result.blocking).toBe(false)
    expect(result.detectedProcesses).toEqual([])
  })

  it('only checks network for desktop PIDs (service PIDs excluded from network probe)', async () => {
    const queriedPids: number[] = []

    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'UltraViewer_Service.exe', pid: 100 },
          { name: 'UltraViewer_Desktop.exe', pid: 200 }
        ],
        listNetworkConnections: async (pids) => {
          queriedPids.push(...pids)
          return []
        },
        hasVisibleWindow: async () => false
      })
    })

    await service.evaluate()
    // Should only have queried PID 200 (desktop), not 100 (service)
    expect(queriedPids).toEqual([200])
  })

  it('includes all detected processes (service + desktop) in output for UI display', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'UltraViewer_Service.exe', pid: 100 },
          { name: 'UltraViewer_Desktop.exe', pid: 200 }
        ],
        listNetworkConnections: async () => [
          { pid: 200, state: 'Established', remoteAddress: '146.59.253.24' }
        ],
        hasVisibleWindow: async () => true
      })
    })

    const result = await service.evaluate()
    expect(result.detectedProcesses).toHaveLength(2)
    expect(result.detectedProcesses.map((p) => p.name)).toContain('UltraViewer_Service.exe')
    expect(result.detectedProcesses.map((p) => p.name)).toContain('UltraViewer_Desktop.exe')
  })

  it('builds foreground probe script without PowerShell reserved $pid variable', () => {
    const script = __internal.buildForegroundProcessScript()
    expect(script).toContain('$foregroundPid = [uint32]0')
    expect(script).not.toContain('$pid = 0')
  })

  // ===== RUSTDESK UDP BYPASS FIX =====
  it('returns HIGH when RustDesk has active session window (UDP-based, single TCP connection)', async () => {
    // This simulates the exact scenario: RustDesk uses UDP for screen streaming,
    // so only 1 TCP relay connection exists, but the window title proves an active session
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'RustDesk.exe', pid: 111 },
          { name: 'RustDesk.exe', pid: 222 }
        ],
        listNetworkConnections: async () => [
          // Only 1 relay TCP connection (below threshold of 2)
          { pid: 111, state: 'Established', remoteAddress: '15.204.87.212' }
        ],
        hasVisibleWindow: async () => true,
        hasActiveSessionWindow: async () => true // Window title: "1279903594 - RustDesk"
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('high')
    expect(result.blocking).toBe(true)
    expect(result.activeSignals).toContain('active-session-window')
  })

  it('returns MEDIUM when RustDesk is idle (no active session window)', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'RustDesk.exe', pid: 111 }
        ],
        listNetworkConnections: async () => [
          { pid: 111, state: 'Established', remoteAddress: '15.204.87.212' }
        ],
        hasVisibleWindow: async () => true,
        hasActiveSessionWindow: async () => false // Just main window "RustDesk", no session
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('medium')
    expect(result.blocking).toBe(false)
    expect(result.activeSignals).not.toContain('active-session-window')
  })

  // ===== NEW TOOLS: Chrome Remote Desktop =====
  it('detects Chrome Remote Desktop host with network connections', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'remoting_desktop.exe', pid: 500 }
        ],
        listNetworkConnections: async () => [
          { pid: 500, state: 'Established', remoteAddress: '142.250.185.46' }
        ],
        hasVisibleWindow: async () => false
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('medium')
    expect(result.detectedProcesses).toHaveLength(1)
    expect(result.activeSignals).toContain('network')
  })

  // ===== NEW TOOLS: VNC Family =====
  it('detects VNC server with multiple connections as HIGH risk', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'vncserver.exe', pid: 600 }
        ],
        listNetworkConnections: async () => [
          { pid: 600, state: 'Established', remoteAddress: '192.168.1.50' },
          { pid: 600, state: 'Established', remoteAddress: '192.168.1.51' }
        ],
        hasVisibleWindow: async () => false
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('high')
    expect(result.blocking).toBe(true)
    expect(result.activeSignals).toContain('network-multi')
  })

  it('detects TightVNC with single connection as MEDIUM risk', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'tvnserver.exe', pid: 700 }
        ],
        listNetworkConnections: async () => [
          { pid: 700, state: 'Established', remoteAddress: '10.0.0.50' }
        ],
        hasVisibleWindow: async () => false
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('medium')
    expect(result.blocking).toBe(false)
    expect(result.activeSignals).toContain('network')
  })

  // ===== NEW TOOLS: Enterprise =====
  it('detects ConnectWise ScreenConnect as remote desktop tool', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'ScreenConnect.ClientService.exe', pid: 800 },
          { name: 'ScreenConnect.WindowsClient.exe', pid: 801 }
        ],
        listNetworkConnections: async () => [
          // 2+ connections on same PID triggers network-multi → HIGH
          { pid: 800, state: 'Established', remoteAddress: '34.120.0.1' },
          { pid: 800, state: 'Established', remoteAddress: '34.120.0.2' }
        ],
        hasVisibleWindow: async () => true
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('high')
    expect(result.blocking).toBe(true)
    expect(result.detectedProcesses).toHaveLength(2)
  })

  // ===== EDGE CASE: Multiple tools running simultaneously =====
  it('aggregates signals from multiple remote tools running at once', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'TeamViewer.exe', pid: 100 },
          { name: 'TeamViewer_Service.exe', pid: 101 },
          { name: 'vncserver.exe', pid: 200 },
          { name: 'AnyDesk.exe', pid: 300 }
        ],
        listNetworkConnections: async () => [
          // Only TeamViewer and VNC have connections; AnyDesk idle
          { pid: 100, state: 'Established', remoteAddress: '52.0.0.1' },
          { pid: 200, state: 'Established', remoteAddress: '192.168.1.50' },
          { pid: 200, state: 'Established', remoteAddress: '192.168.1.51' }
        ],
        hasVisibleWindow: async () => true
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('high') // VNC has 2 connections → network-multi
    expect(result.blocking).toBe(true)
    // All 4 processes reported (service + 3 desktop)
    expect(result.detectedProcesses).toHaveLength(4)
    expect(result.activeSignals).toContain('network-multi')
  })

  // ===== Tier 4: Parsec detection =====
  it('detects Parsec desktop with service running as LOW (service-only not probed)', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'pservice.exe', pid: 900 } // Only service, no parsecd desktop
        ]
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('low')
    expect(result.detectedProcesses).toHaveLength(1)
  })

  it('detects Ammyy Admin as HIGH when actively connected', async () => {
    const service = new RemoteRiskService({
      detector: createMockDetector({
        listProcesses: async () => [
          { name: 'AA_v3.exe', pid: 950 }
        ],
        listNetworkConnections: async () => [
          { pid: 950, state: 'Established', remoteAddress: '85.10.0.1' },
          { pid: 950, state: 'Established', remoteAddress: '85.10.0.2' }
        ],
        hasVisibleWindow: async () => true
      })
    })

    const result = await service.evaluate()
    expect(result.level).toBe('high')
    expect(result.blocking).toBe(true)
  })
})
