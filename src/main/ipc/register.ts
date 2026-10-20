import { registerWindowIpc } from './window';
import { registerAuthIpc } from './auth';
import { registerAppIpc } from './app';
import { registerUpdateIpc } from './update';

export function registerAllIpcHandlers(): void {
  registerWindowIpc();
  registerAuthIpc();
  registerAppIpc();
  registerUpdateIpc();
}
