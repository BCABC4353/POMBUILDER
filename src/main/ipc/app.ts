import { ipcMain, app } from 'electron';

export function registerAppIpc(): void {
  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });
}
