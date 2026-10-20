import { app, BrowserWindow, session } from 'electron';
import { PARTITION_NAME } from '../shared/constants';
import { installCsp } from './security';
import { createWindow, getMainWindow, isDev } from './window';
import { registerAllIpcHandlers } from './ipc/register';
import { setupAutoUpdater, setSendState } from './updater';

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const appNameToken = app.getName().replace(/[.*+?^${}()|[\]\\\s]/g, '\\$&');
    app.userAgentFallback = app.userAgentFallback
      .replace(/ Electron\/[\d.]+/i, '')
      .replace(new RegExp(` ${appNameToken}\\/[\\d.]+`, 'i'), '');

    installCsp(session.defaultSession);
    if (!isDev) installCsp(session.fromPartition(PARTITION_NAME));

    registerAllIpcHandlers();

    setSendState((state) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('update:state', state);
      }
    });

    createWindow();
    setupAutoUpdater();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('certificate-error', (_event, _webContents, url, error, _certificate, callback) => {
  console.error('[certificate-error]', url, error);
  callback(false);
});
