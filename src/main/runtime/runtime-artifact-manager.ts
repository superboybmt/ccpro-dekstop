import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface RuntimeArtifactPaths {
  runtimeFingerprint: string
  runtimeRoot: string
  manifestPath: string
  machineConfigHelperPath: string
  deviceSyncWorkerPath: string
  appConfigSeedPath: string
}

type RuntimeArtifactDefinition = {
  key: 'machineConfigHelperPath' | 'deviceSyncWorkerPath' | 'appConfigSeedPath'
  relativePath: string[]
}

const runtimeArtifactDefinitions: RuntimeArtifactDefinition[] = [
  {
    key: 'machineConfigHelperPath',
    relativePath: ['machine-config', 'machine-config-helper.exe']
  },
  {
    key: 'deviceSyncWorkerPath',
    relativePath: ['device-sync', 'device-sync-worker.exe']
  },
  {
    key: 'appConfigSeedPath',
    relativePath: ['bootstrap', 'app-config.seed.json']
  }
]

const sha256File = (filePath: string): string => createHash('sha256').update(readFileSync(filePath)).digest('hex')

type RuntimeArtifactHash = {
  key: RuntimeArtifactDefinition['key']
  relativePath: string
  sha256: string
}

const collectRuntimeArtifactHashes = (processResourcesPath: string): RuntimeArtifactHash[] =>
  runtimeArtifactDefinitions.map((definition) => {
    const sourcePath = join(processResourcesPath, ...definition.relativePath)

    return {
      key: definition.key,
      relativePath: definition.relativePath.join('/'),
      sha256: sha256File(sourcePath)
    }
  })

const createRuntimeFingerprint = (artifactHashes: RuntimeArtifactHash[]): string =>
  createHash('sha256').update(JSON.stringify(artifactHashes)).digest('hex').slice(0, 12)

const ensureStagedArtifact = (sourcePath: string, destinationPath: string): string => {
  const sourceHash = sha256File(sourcePath)
  const destinationHash = existsSync(destinationPath) ? sha256File(destinationPath) : null

  if (destinationHash !== sourceHash) {
    mkdirSync(dirname(destinationPath), { recursive: true })
    copyFileSync(sourcePath, destinationPath)
  }

  return sourceHash
}

export const resolvePortableRuntimeRoot = (appDataPath: string, appVersion: string, runtimeFingerprint: string): string =>
  join(appDataPath, 'ccpro-desktop', 'runtime', appVersion, runtimeFingerprint)

export const stagePackagedRuntimeArtifacts = (args: {
  appDataPath: string
  appVersion: string
  processResourcesPath: string
}): RuntimeArtifactPaths => {
  const artifactHashes = collectRuntimeArtifactHashes(args.processResourcesPath)
  const runtimeFingerprint = createRuntimeFingerprint(artifactHashes)
  const runtimeRoot = resolvePortableRuntimeRoot(args.appDataPath, args.appVersion, runtimeFingerprint)
  const manifestPath = join(runtimeRoot, 'manifest.json')

  const stagedPaths = runtimeArtifactDefinitions.reduce(
    (paths, definition) => {
      const sourcePath = join(args.processResourcesPath, ...definition.relativePath)
      const destinationPath = join(runtimeRoot, ...definition.relativePath)
      const sourceHash = ensureStagedArtifact(sourcePath, destinationPath)

      return {
        ...paths,
        [definition.key]: destinationPath,
        artifacts: {
          ...paths.artifacts,
          [definition.key]: {
            relativePath: definition.relativePath.join('/'),
            sha256: sourceHash
          }
        }
      }
    },
    {
      runtimeFingerprint,
      runtimeRoot,
      manifestPath,
      machineConfigHelperPath: '',
      deviceSyncWorkerPath: '',
      appConfigSeedPath: '',
      artifacts: {} as Record<string, { relativePath: string; sha256: string }>
    }
  )

  mkdirSync(dirname(manifestPath), { recursive: true })
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        version: args.appVersion,
        runtimeFingerprint,
        generatedAt: new Date().toISOString(),
        artifacts: stagedPaths.artifacts
      },
      null,
      2
    )}\n`,
    'utf8'
  )

  return {
    runtimeFingerprint: stagedPaths.runtimeFingerprint,
    runtimeRoot: stagedPaths.runtimeRoot,
    manifestPath: stagedPaths.manifestPath,
    machineConfigHelperPath: stagedPaths.machineConfigHelperPath,
    deviceSyncWorkerPath: stagedPaths.deviceSyncWorkerPath,
    appConfigSeedPath: stagedPaths.appConfigSeedPath
  }
}
