import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

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

const electronAPIMock = {
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
};

declare global {
  interface Window {
    electronAPI: typeof electronAPIMock;
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
