export type { IPCResponse, TokenResult } from './ipc-types';

export interface ForceUpdateState {
  active: boolean;
  version?: string;
  secondsLeft: number;
  holding: boolean;
  message?: string;
}

export interface UserInfo {
  id: string;
  displayName: string;
  email: string;
}

export type AuthResult =
  | {
      success: true;
      user: UserInfo;
      reusedPreviousAccount: boolean;
    }
  | { success: false; error: string };
