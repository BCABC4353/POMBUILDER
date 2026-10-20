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

export interface GateInfo {
  code: string;
  blocking: boolean;
  default_checked: boolean;
  message: string;
  fix_hint: string;
}

export interface ClaimRow {
  TripID: number;
  RunNumber: number;
  RunNumberText: string;
  TripDate: string;
  PatientName: string;
  TripStatus: string;
  StatusCode: number;
  SubSeq: string;
  BillAsEmergency: number;
  MemberID: string;
  PatientDOB: string;
  CurrentPayor: string;
  PayorSystemID: string;
  AddresseeSource: string;
  AddresseeFacility: string;
  AddresseeAddr: string;
  AddresseeAddr2: string;
  AddresseeCity: string;
  AddresseeState: string;
  AddresseeZip: string;
  OrderingDoctorName: string;
  gates: GateInfo[];
  checkable: boolean;
  checked: boolean;
  recipient_lines: string[];
  supplier_lines: string[];
  pcs_form: string;
}

export interface LoadResult {
  rows: ClaimRow[];
  gated: number;
  lastRefresh: string | null;
}

export interface GenerateResult {
  print_pdf: string;
  manifest_csv: string;
  gates_csv: string;
  pages: number;
  claims: number;
  out_dir?: string;
}

export interface SettingsData {
  outputDir: string | null;
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
    setTitleBarOverlay: (options: { color: string; symbolColor: string; height?: number }) => Promise<void>;
  };

  app: {
    getVersion: () => Promise<string>;
    openOutput: (dir: string) => Promise<void>;
  };

  update: {
    onState: (cb: (state: ForceUpdateState) => void) => () => void;
    install: () => Promise<void>;
  };

  claims: {
    load: () => Promise<IPCResponse<LoadResult>>;
    refresh: () => Promise<IPCResponse<LoadResult>>;
    generate: (opts: { tripIds: number[] }) => Promise<IPCResponse<GenerateResult>>;
    onProgress: (cb: (text: string) => void) => () => void;
  };

  settings: {
    get: () => Promise<SettingsData>;
    chooseOutputDir: () => Promise<string | null>;
  };
}
