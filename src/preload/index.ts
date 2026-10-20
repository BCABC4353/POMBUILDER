import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { ElectronAPI, RefreshProgress } from '../shared/ipc-types';
import type { ForceUpdateState } from '../shared/types';

const electronAPI: ElectronAPI = {
  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getUser: () => ipcRenderer.invoke('auth:get-user'),
    getAccessToken: () => ipcRenderer.invoke('auth:get-token'),
    isAuthenticated: () => ipcRenderer.invoke('auth:is-authenticated'),
    validateToken: () => ipcRenderer.invoke('auth:validate-token'),
    switchAccount: () => ipcRenderer.invoke('auth:switch-account'),
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    setTitleBarOverlay: (options: { color: string; symbolColor: string; height?: number }): Promise<void> => {
      ipcRenderer.send('window:set-title-bar-overlay', options);
      return Promise.resolve();
    },
  },

  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
    openOutput: (dir: string): Promise<void> => ipcRenderer.invoke('app:openOutput', dir),
  },

  update: {
    onState: (cb: (state: ForceUpdateState) => void) => {
      const handler = (_event: IpcRendererEvent, state: ForceUpdateState) => cb(state);
      ipcRenderer.on('update:state', handler);
      return () => ipcRenderer.removeListener('update:state', handler);
    },
    install: () => ipcRenderer.invoke('update:install'),
  },

  claims: {
    load: () => ipcRenderer.invoke('claims:load'),
    refresh: () => ipcRenderer.invoke('claims:refresh'),
    generate: (opts: { tripIds: number[] }) =>
      ipcRenderer.invoke('claims:generate', opts),
    onProgress: (cb: (progress: RefreshProgress) => void) => {
      const handler = (_event: IpcRendererEvent, progress: RefreshProgress) => cb(progress);
      ipcRenderer.on('claims:progress', handler);
      return () => ipcRenderer.removeListener('claims:progress', handler);
    },
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    chooseOutputDir: () => ipcRenderer.invoke('settings:chooseOutputDir'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
