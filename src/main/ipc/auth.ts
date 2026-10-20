import { ipcMain } from 'electron';
import { getAuthService } from '../auth/singleton';

export function registerAuthIpc(): void {
  ipcMain.handle('auth:login', async () => {
    return await getAuthService().login();
  });

  ipcMain.handle('auth:logout', async () => {
    return await getAuthService().logout();
  });

  ipcMain.handle('auth:get-user', async () => {
    return await getAuthService().getCurrentUser();
  });

  ipcMain.handle('auth:get-token', async () => {
    return await getAuthService().getAccessToken();
  });

  ipcMain.handle('auth:is-authenticated', async () => {
    return await getAuthService().isAuthenticated();
  });

  ipcMain.handle('auth:validate-token', async () => {
    return await getAuthService().validateToken();
  });

  ipcMain.handle('auth:switch-account', async () => {
    return await getAuthService().switchAccount();
  });
}
