import { describe, expect, it, vi } from 'vitest'

const stagePackagedRuntimeArtifactsMock = vi.fn()

vi.mock('../runtime-artifact-manager', () => ({
  stagePackagedRuntimeArtifacts: stagePackagedRuntimeArtifactsMock
}))

describe('preparePackagedRuntimeEnvironment', () => {
  it('stages packaged artifacts and exports stable helper paths through process.env', async () => {
    stagePackagedRuntimeArtifactsMock.mockReturnValue({
      runtimeRoot: 'C:\\Users\\tester\\AppData\\Roaming\\ccpro-desktop\\runtime\\1.0.3',
      manifestPath: 'C:\\Users\\tester\\AppData\\Roaming\\ccpro-desktop\\runtime\\1.0.3\\manifest.json',
      machineConfigHelperPath:
        'C:\\Users\\tester\\AppData\\Roaming\\ccpro-desktop\\runtime\\1.0.3\\machine-config\\machine-config-helper.exe',
      deviceSyncWorkerPath:
        'C:\\Users\\tester\\AppData\\Roaming\\ccpro-desktop\\runtime\\1.0.3\\device-sync\\device-sync-worker.exe',
      appConfigSeedPath:
        'C:\\Users\\tester\\AppData\\Roaming\\ccpro-desktop\\runtime\\1.0.3\\bootstrap\\app-config.seed.json'
    })

    const { preparePackagedRuntimeEnvironment } = await import('../runtime-environment')

    const result = preparePackagedRuntimeEnvironment({
      appDataPath: 'C:\\Users\\tester\\AppData\\Roaming',
      appVersion: '1.0.3',
      processResourcesPath: 'E:\\ccpro\\release\\win-unpacked\\resources'
    })

    expect(stagePackagedRuntimeArtifactsMock).toHaveBeenCalledWith({
      appDataPath: 'C:\\Users\\tester\\AppData\\Roaming',
      appVersion: '1.0.3',
      processResourcesPath: 'E:\\ccpro\\release\\win-unpacked\\resources'
    })
    expect(result.machineConfigHelperPath).toBe(process.env.CCPRO_MACHINE_CONFIG_HELPER_PATH)
    expect(result.deviceSyncWorkerPath).toBe(process.env.CCPRO_DEVICE_SYNC_WORKER_PATH)
    expect(result.appConfigSeedPath).toBe(process.env.CCPRO_APP_CONFIG_SEED_PATH)
  })
})
