import { stagePackagedRuntimeArtifacts, type RuntimeArtifactPaths } from './runtime-artifact-manager'

export const preparePackagedRuntimeEnvironment = (args: {
  appDataPath: string
  appVersion: string
  processResourcesPath: string
}): RuntimeArtifactPaths => {
  const artifacts = stagePackagedRuntimeArtifacts(args)

  process.env.CCPRO_MACHINE_CONFIG_HELPER_PATH = artifacts.machineConfigHelperPath
  process.env.CCPRO_DEVICE_SYNC_WORKER_PATH = artifacts.deviceSyncWorkerPath
  process.env.CCPRO_APP_CONFIG_SEED_PATH = artifacts.appConfigSeedPath

  return artifacts
}
