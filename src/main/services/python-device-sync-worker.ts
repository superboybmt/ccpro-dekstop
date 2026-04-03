/**
 * Child-process based DeviceSyncWorker implementation (Python / bundled .exe).
 *
 * Extracted from device-sync-service.ts for maintainability.
 * All spawn logic is unchanged — only the file location moved.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { app } from 'electron'
import {
  resolveDeviceSyncWorkerLaunch,
  toErrorMessage,
  type DeviceRealtimeWorkerResponse,
  type DeviceSyncRealtimeHandlers,
  type DeviceSyncWorker,
  type DeviceWorkerInput,
  type DeviceWorkerLaunch,
  type DeviceWorkerResponse,
  type DeviceWorkerResult
} from './device-sync.types'

export class PythonDeviceSyncWorker implements DeviceSyncWorker {
  private currentChild: ChildProcess | null = null

  private stopRequested = false

  async run(input: DeviceWorkerInput): Promise<DeviceWorkerResult> {
    const { command, args } = this.resolveLaunch('once', input)
    return this.spawnWorker(command, args)
  }

  async startRealtime(input: DeviceWorkerInput, handlers: DeviceSyncRealtimeHandlers): Promise<void> {
    const { command, args } = this.resolveLaunch('daemon', input)

    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })

      this.currentChild = child
      this.stopRequested = false

      let ready = false
      let stderr = ''
      let stdoutBuffer = ''
      let batchQueue = Promise.resolve()

      const handleRealtimePayload = (payload: DeviceRealtimeWorkerResponse): void => {
        if (payload.type === 'ready') {
          ready = true
          resolve()
          return
        }

        batchQueue = batchQueue.then(async () => {
          await handlers.onBatch(payload.result)
        })
      }

      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString()
        const lines = stdoutBuffer.split(/\r?\n/)
        stdoutBuffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) {
            continue
          }

          try {
            handleRealtimePayload(JSON.parse(trimmed) as DeviceRealtimeWorkerResponse)
          } catch (error) {
            void handlers.onError(
              new Error(`Khong parse duoc ket qua realtime tu device sync worker: ${toErrorMessage(error)}`)
            )
          }
        }
      })

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', async (error) => {
        this.currentChild = null
        if (!ready) {
          reject(error)
          return
        }

        await handlers.onError(error)
      })

      child.on('close', async (code) => {
        this.currentChild = null
        await batchQueue.catch(() => undefined)
        await handlers.onExit()

        if (this.stopRequested) {
          return
        }

        if (!ready) {
          reject(new Error(stderr.trim() || `Device sync worker exited with code ${code ?? -1}`))
          return
        }

        await handlers.onError(new Error(stderr.trim() || `Device sync worker exited with code ${code ?? -1}`))
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.currentChild || this.currentChild.killed) {
      return
    }

    this.stopRequested = true
    this.currentChild.kill()
    this.currentChild = null
  }

  private resolveLaunch(mode: 'once' | 'daemon', input: DeviceWorkerInput): DeviceWorkerLaunch {
    const launch = resolveDeviceSyncWorkerLaunch({
      isPackaged: app.isPackaged,
      platform: process.platform,
      processCwd: process.cwd(),
      processResourcesPath: process.resourcesPath,
      overrideExecutablePath: process.env.CCPRO_DEVICE_SYNC_WORKER_PATH
    })
    const payload = JSON.stringify({ mode, input })

    if (app.isPackaged && process.platform === 'win32') {
      if (!existsSync(launch.command)) {
        throw new Error(`Khong tim thay bundled device sync worker: ${launch.command}`)
      }

      return {
        command: launch.command,
        args: [payload]
      }
    }

    if (!existsSync(launch.args[0] ?? '')) {
      throw new Error('Khong tim thay device-sync-worker.py')
    }

    return {
      command: launch.command,
      args: [...launch.args, payload]
    }
  }

  private spawnWorker(command: string, args: string[]): Promise<DeviceWorkerResult> {
    return new Promise<DeviceWorkerResult>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })

      this.currentChild = child
      this.stopRequested = false

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', (error) => {
        this.currentChild = null
        reject(error)
      })

      child.on('close', (code) => {
        this.currentChild = null

        if (!stdout.trim()) {
          reject(new Error(stderr.trim() || `Device sync worker exited with code ${code ?? -1}`))
          return
        }

        let payload: DeviceWorkerResponse
        try {
          payload = JSON.parse(stdout) as DeviceWorkerResponse
        } catch (error) {
          reject(
            new Error(
              `Khong parse duoc ket qua tu device sync worker: ${toErrorMessage(error)}; stdout=${stdout.trim()}`
            )
          )
          return
        }

        if (!payload.ok || !payload.result) {
          reject(new Error(payload.error ?? (stderr.trim() || 'Device sync worker failed')))
          return
        }

        resolve(payload.result)
      })
    })
  }
}
