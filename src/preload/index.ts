import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { ElectronAPI } from '../shared/ipc-types';
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
    setTitleBarOverlay: (options: { color: string; symbolColor: string }): Promise<void> => {
      ipcRenderer.send('window:set-title-bar-overlay', options);
      return Promise.resolve();
    },
  },

  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  },

  update: {
    onState: (cb: (state: ForceUpdateState) => void) => {
      const handler = (_event: IpcRendererEvent, state: ForceUpdateState) => cb(state);
      ipcRenderer.on('update:state', handler);
      return () => ipcRenderer.removeListener('update:state', handler);
    },
    install: () => ipcRenderer.invoke('update:install'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
