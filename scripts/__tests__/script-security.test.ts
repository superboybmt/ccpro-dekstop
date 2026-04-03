// @vitest-environment node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(currentDir, '..', '..')

const deleteEnvInsensitive = (env: NodeJS.ProcessEnv, targetKey: string) => {
  const normalizedTarget = targetKey.toLowerCase()

  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === normalizedTarget) {
      delete env[key]
    }
  }
}

const runNodeScript = (relativePath: string, args: string[] = [], extraEnv: Record<string, string> = {}) => {
  const env = { ...process.env, ...extraEnv }
  deleteEnvInsensitive(env, 'WISEEYE_SQL_PASSWORD')
  deleteEnvInsensitive(env, 'CCPRO_APP_DATABASE')
  deleteEnvInsensitive(env, 'NODE_OPTIONS')
  deleteEnvInsensitive(env, 'DOTENV_CONFIG_PATH')
  deleteEnvInsensitive(env, 'DOTENV_CONFIG_QUIET')

  env.DOTENV_CONFIG_PATH = resolve(repoRoot, '.env.test-does-not-exist')
  env.DOTENV_CONFIG_QUIET = 'true'

  for (const [key, value] of Object.entries(extraEnv)) {
    env[key] = value
  }

  return spawnSync(process.execPath, [resolve(repoRoot, relativePath), ...args], {
    cwd: repoRoot,
    env,
    encoding: 'utf8'
  })
}

describe('maintenance script security', () => {
  it('does not keep production credentials hard-coded inside operational scripts', () => {
    const scriptPaths = [
      'scripts/init-db.mjs',
      'scripts/reset-admin-password.mjs',
      'scripts/zk-apply-hc-auto-switch.ps1',
      'scripts/zk-shortkey-tool.ps1',
      'scripts/zk-ssr-device-data-tool.ps1',
      'scripts/zk-state-mode.py'
    ]

    for (const relativePath of scriptPaths) {
      const source = readFileSync(resolve(repoRoot, relativePath), 'utf8')
      expect(source).not.toContain('Pnj@12345')
      expect(source).not.toContain('938948')
    }
  })

  it('uses current-user COM bootstrap for zkemkeeper instead of requiring Administrator registration', () => {
    const source = readFileSync(resolve(repoRoot, 'scripts/zk-ssr-device-data-tool.ps1'), 'utf8')

    expect(source).not.toContain('Administrator rights to register it automatically')
    expect(source).not.toContain('regsvr32.exe')
    expect(source).toContain('HKCU:\\Software\\Classes')
    expect(source).toContain('TypeLib')
    expect(source).toContain('AppID')
  })

  it('packages the VB6 runtime dependency for machine-config helper when available on the build host', () => {
    const source = readFileSync(resolve(repoRoot, 'scripts/build-machine-config-helper.ps1'), 'utf8')

    expect(source).toContain('MSVBVM60.DLL')
    expect(source).toContain('SysWOW64')
  })

  it('stages only the required SDK payload files instead of copying the full WiseEye install tree', () => {
    const source = readFileSync(resolve(repoRoot, 'scripts/build-machine-config-helper.ps1'), 'utf8')

    expect(source).not.toContain("Copy-Item -Path (Join-Path $SourcePath '*') -Destination $sdkPayloadPath -Recurse -Force")
    expect(source).toContain('zkemkeeper.dll')
    expect(source).toContain('ZKCommuCryptoClient.dll')
  })

  it('fails fast when init-db runs without an explicit SQL password', () => {
    const result = runNodeScript('scripts/init-db.mjs')

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Missing required environment variable: WISEEYE_SQL_PASSWORD')
  })

  it('rejects unsafe application database names before opening a SQL connection', () => {
    const result = runNodeScript('scripts/init-db.mjs', [], {
      WISEEYE_SQL_PASSWORD: 'placeholder-secret',
      CCPRO_APP_DATABASE: 'CCPro]; DROP DATABASE master;--'
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Invalid CCPRO_APP_DATABASE')
  })

  it('fails fast when reset-admin-password runs without an explicit SQL password', () => {
    const result = runNodeScript('scripts/reset-admin-password.mjs', [
      '--username',
      'admin',
      '--temporary-password',
      'Temp@123'
    ])

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Missing required environment variable: WISEEYE_SQL_PASSWORD')
  })
})
