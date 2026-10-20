import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
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
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
