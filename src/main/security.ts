import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

export function isValidOutputPath(filePath: string): boolean {
  let resolved = path.resolve(filePath);
  try {
    const realDir = fs.realpathSync(path.dirname(resolved));
    resolved = path.join(realDir, path.basename(resolved));
    if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
      return false;
    }
  } catch {
    return false;
  }
  const downloads = app.getPath('downloads');
  const desktop = app.getPath('desktop');
  const documents = app.getPath('documents');
  const allowedRoots = [downloads, desktop, documents].map((root) => {
    try {
      return fs.realpathSync(root);
    } catch {
      return root;
    }
  });
  return allowedRoots.some((root) => resolved.startsWith(root + path.sep) || resolved === root);
}

const APP_CSP =
  "default-src 'self'; script-src 'self'; " +
  "connect-src https://api.powerbi.com https://login.microsoftonline.com; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "object-src 'none'; base-uri 'self'";

export function installCsp(sess: Electron.Session): void {
  sess.webRequest.onHeadersReceived((details, callback) => {
    if (details.url.startsWith('file://')) {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [APP_CSP] } });
    } else {
      callback({ responseHeaders: details.responseHeaders });
    }
  });
}
