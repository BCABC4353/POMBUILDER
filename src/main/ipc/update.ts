import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import type { ForceUpdateState } from '../../shared/types';
import { install } from '../updater';

export function registerUpdateIpc(): void {
  ipcMain.handle('update:install', () => {
    install();
  });
}

export function pushUpdateState(webContents: WebContents, state: ForceUpdateState): void {
  webContents.send('update:state', state);
}
