import { ipcMain, app, shell } from 'electron';

export function registerAppIpc(): void {
  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:openOutput', async (_event, dir: string) => {
    await shell.openPath(dir);
  });
}
