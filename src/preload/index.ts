import { contextBridge, ipcRenderer } from 'electron'
import type { RendererApi } from '@shared/api'

const api: RendererApi = {
  auth: {
    login: (payload) => ipcRenderer.invoke('auth:login', payload),
    getSession: () => ipcRenderer.invoke('auth:get-session'),
    changePassword: (payload) => ipcRenderer.invoke('auth:change-password', payload),
    logout: () => ipcRenderer.invoke('auth:logout')
  },
  attendance: {
    getDashboard: () => ipcRenderer.invoke('attendance:get-dashboard'),
    checkIn: () => ipcRenderer.invoke('attendance:check-in'),
    checkOut: () => ipcRenderer.invoke('attendance:check-out'),
    getHistory: (filter) => ipcRenderer.invoke('attendance:get-history', filter)
  },
  notifications: {
    list: () => ipcRenderer.invoke('notifications:list'),
    markRead: (id) => ipcRenderer.invoke('notifications:mark-read', id),
    markAllRead: () => ipcRenderer.invoke('notifications:mark-all-read')
  },
  settings: {
    getProfile: () => ipcRenderer.invoke('settings:get-profile'),
    getAppInfo: () => ipcRenderer.invoke('settings:get-app-info')
  },
  deviceSync: {
    getStatus: () => ipcRenderer.invoke('device-sync:get-status'),
    retry: () => ipcRenderer.invoke('device-sync:retry')
  },
  admin: {
    login: (payload) => ipcRenderer.invoke('admin:login', payload),
    getSession: () => ipcRenderer.invoke('admin:get-session'),
    changePassword: (payload) => ipcRenderer.invoke('admin:change-password', payload),
    listAdmins: () => ipcRenderer.invoke('admin:list'),
    resetPassword: (payload) => ipcRenderer.invoke('admin:reset-password', payload),
    logout: () => ipcRenderer.invoke('admin:logout'),
    bootstrap: (args) => ipcRenderer.invoke('admin:bootstrap', args)
  },
  adminUsers: {
    listUsers: (filter) => ipcRenderer.invoke('admin-users:list', filter),
    setUserActiveState: (payload) => ipcRenderer.invoke('admin-users:set-active-state', payload),
    resetUserPassword: (payload) => ipcRenderer.invoke('admin-users:reset-password', payload)
  },
  machineConfig: {
    getConfig: () => ipcRenderer.invoke('machine-config:get'),
    saveConfig: (payload) => ipcRenderer.invoke('machine-config:save', payload),
    syncTime: () => ipcRenderer.invoke('machine-config:sync-time')
  },
  adminSettings: {
    getRemoteRiskPolicy: () => ipcRenderer.invoke('admin-settings:get-remote-risk-policy'),
    saveRemoteRiskPolicy: (policy) => ipcRenderer.invoke('admin-settings:save-remote-risk-policy', policy)
  },
  app: {
    checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    onUpdateAvailable: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, info: any) => callback(info)
      ipcRenderer.on('app:update-available', listener)
      return () => {
        ipcRenderer.off('app:update-available', listener)
      }
    }
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('ccpro', api)
}
