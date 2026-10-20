import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';
import type { ElectronAPI } from '../shared/ipc-types';

function installMatchMediaStub(): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

const electronAPIMock: ElectronAPI = {
  window: {
    minimize: vi.fn().mockResolvedValue(undefined),
    maximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isMaximized: vi.fn().mockResolvedValue(false),
    setTitleBarOverlay: vi.fn().mockResolvedValue(undefined),
  },
  app: {
    getVersion: vi.fn().mockResolvedValue('0.0.0-test'),
  },
  auth: {
    login: vi.fn().mockResolvedValue({ success: false, error: { code: 'NOT_CONFIGURED', message: 'test stub' } }),
    logout: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    getUser: vi.fn().mockResolvedValue({ success: true, data: null }),
    getAccessToken: vi.fn().mockResolvedValue({ success: false, error: { code: 'NO_ACCOUNT', message: 'test stub' } }),
    isAuthenticated: vi.fn().mockResolvedValue({ success: true, data: false }),
    validateToken: vi.fn().mockResolvedValue({ success: true, data: false }),
    switchAccount: vi.fn().mockResolvedValue({ success: false, error: { code: 'NOT_CONFIGURED', message: 'test stub' } }),
  },
  update: {
    onState: vi.fn().mockReturnValue(() => {}),
    install: vi.fn().mockResolvedValue(undefined),
  },
};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  installMatchMediaStub();
  Object.defineProperty(window, 'electronAPI', {
    writable: true,
    configurable: true,
    value: electronAPIMock,
  });
});
