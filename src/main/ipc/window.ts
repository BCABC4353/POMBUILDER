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

  ipcMain.on(
    'window:set-title-bar-overlay',
    (_event, options: { color?: unknown; symbolColor?: unknown; height?: unknown }) => {
      const win = BrowserWindow.fromWebContents(_event.sender);
      const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
      if (!win || !isHex(options?.color) || !isHex(options?.symbolColor)) return;
      const height =
        typeof options.height === 'number' && Number.isFinite(options.height)
          ? Math.min(96, Math.max(24, Math.round(options.height)))
          : undefined;
      try {
        win.setTitleBarOverlay({
          color: options.color,
          symbolColor: options.symbolColor,
          ...(height !== undefined ? { height } : {}),
        });
      } catch {
      }
    },
  );
}
