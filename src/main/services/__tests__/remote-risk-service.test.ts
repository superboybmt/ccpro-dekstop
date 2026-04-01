import { describe, expect, it } from 'vitest'
import {
  __internal,
  RemoteRiskService,
  type RemoteRiskDetector,
  type RemoteProcessInfo,
  type RemoteNetworkConnection
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
    expect(__internal.isDenylisted('UltraViewer_Service.exe')).toBe(true)
    expect(__internal.isDenylisted('UltraViewer_Desktop.exe')).toBe(true)
    expect(__internal.isDenylisted('TeamViewer.exe')).toBe(true)
    expect(__internal.isDenylisted('RustDesk.exe')).toBe(true)
    expect(__internal.isDenylisted('chrome.exe')).toBe(false)
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
})
