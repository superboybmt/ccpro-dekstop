import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolvePortableRuntimeRoot, stagePackagedRuntimeArtifacts } from '../runtime-artifact-manager'

const createdDirs: string[] = []

const createTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'ccpro-runtime-artifacts-'))
  createdDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    try {
      require('node:fs').rmSync(dir, { recursive: true, force: true })
    } catch {
      // best effort cleanup for temp test dirs
    }
  }
})

describe('runtime artifact manager', () => {
  it('stages packaged helper, worker, and seed files into the AppData runtime root', () => {
    const appDataPath = createTempDir()
    const resourcesPath = createTempDir()
    mkdirSync(join(resourcesPath, 'machine-config'), { recursive: true })
    mkdirSync(join(resourcesPath, 'device-sync'), { recursive: true })
    mkdirSync(join(resourcesPath, 'bootstrap'), { recursive: true })

    writeFileSync(join(resourcesPath, 'machine-config', 'machine-config-helper.exe'), 'helper-v1', 'utf8')
    writeFileSync(join(resourcesPath, 'device-sync', 'device-sync-worker.exe'), 'worker-v1', 'utf8')
    writeFileSync(join(resourcesPath, 'bootstrap', 'app-config.seed.json'), '{"sql":{"password":"seed"}}\n', 'utf8')

    const result = stagePackagedRuntimeArtifacts({
      appDataPath,
      appVersion: '1.0.3',
      processResourcesPath: resourcesPath
    })
    const runtimeRoot = resolvePortableRuntimeRoot(appDataPath, '1.0.3', result.runtimeFingerprint)

    expect(result.runtimeRoot.startsWith(join(appDataPath, 'ccpro-desktop', 'runtime', '1.0.3'))).toBe(true)
    expect(result.runtimeRoot).not.toBe(join(appDataPath, 'ccpro-desktop', 'runtime', '1.0.3'))
    expect(result.machineConfigHelperPath).toBe(join(runtimeRoot, 'machine-config', 'machine-config-helper.exe'))
    expect(result.deviceSyncWorkerPath).toBe(join(runtimeRoot, 'device-sync', 'device-sync-worker.exe'))
    expect(result.appConfigSeedPath).toBe(join(runtimeRoot, 'bootstrap', 'app-config.seed.json'))
    expect(existsSync(result.manifestPath)).toBe(true)
    expect(readFileSync(result.machineConfigHelperPath, 'utf8')).toBe('helper-v1')
    expect(readFileSync(result.deviceSyncWorkerPath, 'utf8')).toBe('worker-v1')
    expect(readFileSync(result.appConfigSeedPath, 'utf8')).toContain('"password":"seed"')
  })

  it('repairs a corrupted staged artifact by copying it again from packaged resources', () => {
    const appDataPath = createTempDir()
    const resourcesPath = createTempDir()
    mkdirSync(join(resourcesPath, 'machine-config'), { recursive: true })
    mkdirSync(join(resourcesPath, 'device-sync'), { recursive: true })
    mkdirSync(join(resourcesPath, 'bootstrap'), { recursive: true })

    const helperSourcePath = join(resourcesPath, 'machine-config', 'machine-config-helper.exe')
    writeFileSync(helperSourcePath, 'helper-v1', 'utf8')
    writeFileSync(join(resourcesPath, 'device-sync', 'device-sync-worker.exe'), 'worker-v1', 'utf8')
    writeFileSync(join(resourcesPath, 'bootstrap', 'app-config.seed.json'), '{"sql":{"password":"seed"}}\n', 'utf8')

    const firstStage = stagePackagedRuntimeArtifacts({
      appDataPath,
      appVersion: '1.0.3',
      processResourcesPath: resourcesPath
    })

    writeFileSync(firstStage.machineConfigHelperPath, 'corrupted-helper', 'utf8')

    const secondStage = stagePackagedRuntimeArtifacts({
      appDataPath,
      appVersion: '1.0.3',
      processResourcesPath: resourcesPath
    })

    expect(secondStage.machineConfigHelperPath).toBe(firstStage.machineConfigHelperPath)
    expect(readFileSync(secondStage.machineConfigHelperPath, 'utf8')).toBe(readFileSync(helperSourcePath, 'utf8'))
  })

  it('switches to a new runtime root when packaged artifacts change within the same app version', () => {
    const appDataPath = createTempDir()
    const resourcesPath = createTempDir()
    mkdirSync(join(resourcesPath, 'machine-config'), { recursive: true })
    mkdirSync(join(resourcesPath, 'device-sync'), { recursive: true })
    mkdirSync(join(resourcesPath, 'bootstrap'), { recursive: true })

    writeFileSync(join(resourcesPath, 'machine-config', 'machine-config-helper.exe'), 'helper-v1', 'utf8')
    writeFileSync(join(resourcesPath, 'device-sync', 'device-sync-worker.exe'), 'worker-v1', 'utf8')
    writeFileSync(join(resourcesPath, 'bootstrap', 'app-config.seed.json'), '{"sql":{"password":"seed"}}\n', 'utf8')

    const firstStage = stagePackagedRuntimeArtifacts({
      appDataPath,
      appVersion: '1.0.3',
      processResourcesPath: resourcesPath
    })

    writeFileSync(join(resourcesPath, 'device-sync', 'device-sync-worker.exe'), 'worker-v2', 'utf8')

    const secondStage = stagePackagedRuntimeArtifacts({
      appDataPath,
      appVersion: '1.0.3',
      processResourcesPath: resourcesPath
    })

    expect(secondStage.runtimeRoot).not.toBe(firstStage.runtimeRoot)
    expect(secondStage.deviceSyncWorkerPath).not.toBe(firstStage.deviceSyncWorkerPath)
    expect(readFileSync(secondStage.deviceSyncWorkerPath, 'utf8')).toBe('worker-v2')
    expect(readFileSync(firstStage.deviceSyncWorkerPath, 'utf8')).toBe('worker-v1')
  })
})
