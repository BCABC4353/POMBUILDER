import type { AuthResult, UserInfo } from './types';
import type { ForceUpdateState } from './types';

export type IPCResponse<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: {
        code: string;
        message: string;
        userMessage?: string;
      };
    };

export interface TokenResult {
  accessToken: string;
  expiresOn: string | null;
}

export interface ElectronAPI {
  auth: {
    login: () => Promise<IPCResponse<AuthResult>>;
    logout: () => Promise<IPCResponse<void>>;
    getUser: () => Promise<IPCResponse<UserInfo | null>>;
    getAccessToken: () => Promise<IPCResponse<TokenResult>>;
    isAuthenticated: () => Promise<IPCResponse<boolean>>;
    validateToken: () => Promise<IPCResponse<boolean>>;
    switchAccount: () => Promise<IPCResponse<AuthResult>>;
  };

  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    setTitleBarOverlay: (options: { color: string; symbolColor: string }) => Promise<void>;
  };

  app: {
    getVersion: () => Promise<string>;
  };

  update: {
    onState: (cb: (state: ForceUpdateState) => void) => () => void;
    install: () => Promise<void>;
  };
}
