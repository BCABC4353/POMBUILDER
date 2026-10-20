import { ipcMain, BrowserWindow } from 'electron';

export function registerWindowIpc(): void {
  ipcMain.handle('window:minimize', (_event) => {
    const win = BrowserWindow.fromWebContents(_event.sender);
    win?.minimize();
  });

  ipcMain.handle('window:maximize', (_event) => {
    const win = BrowserWindow.fromWebContents(_event.sender);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.handle('window:close', (_event) => {
    const win = BrowserWindow.fromWebContents(_event.sender);
    win?.close();
  });

  ipcMain.handle('window:is-maximized', (_event) => {
    const win = BrowserWindow.fromWebContents(_event.sender);
    return win?.isMaximized() ?? false;
  });

  ipcMain.on('window:set-title-bar-overlay', (_event, options: { color: string; symbolColor: string }) => {
    const win = BrowserWindow.fromWebContents(_event.sender);
    try {
      win?.setTitleBarOverlay(options);
    } catch {
    }
  });
}
