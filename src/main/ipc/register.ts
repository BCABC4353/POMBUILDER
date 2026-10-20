import { registerWindowIpc } from './window';
import { registerAuthIpc } from './auth';
import { registerAppIpc } from './app';
import { registerUpdateIpc } from './update';
import { registerClaimsIpc } from './claims';

export function registerAllIpcHandlers(): void {
  registerWindowIpc();
  registerAuthIpc();
  registerAppIpc();
  registerUpdateIpc();
  registerClaimsIpc();
}
